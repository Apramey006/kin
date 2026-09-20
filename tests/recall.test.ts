import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaceOutcome, KeeperResult, MemoryRow } from "../lib/types";
const h = vi.hoisted(() => ({
  sb: null as unknown,
  face: { status: "matched", subjectNodeId: "nora", model: "canonical", enrollmentIds: ["e"], distance: .3, v: 1 } as FaceOutcome,
  keepers: [] as KeeperResult[],
  caption: vi.fn(), embed: vi.fn(), rewrite: vi.fn(), tts: vi.fn(), recognize: vi.fn(),
  keeperError: false,
}));
vi.mock("@/lib/supabase", () => ({ getServiceClient: () => h.sb }));
vi.mock("@/lib/faces-server", () => ({ recognizeFace: (...args: unknown[]) => h.recognize(...args) }));
vi.mock("@/lib/providers/openai", () => ({ captionImage: (...args: unknown[]) => h.caption(...args), embedText: (...args: unknown[]) => h.embed(...args), chatJSON: (...args: unknown[]) => h.rewrite(...args) }));
vi.mock("@/lib/providers/elevenlabs", () => ({ synthesizeSpeech: (...args: unknown[]) => h.tts(...args) }));
vi.mock("@/lib/keepers", async importOriginal => {
  const original = await importOriginal<typeof import("../lib/keepers")>();
  return { ...original, runKeepers: async () => { if (h.keeperError) throw new Error("database down"); return h.keepers; } };
});
import { POST, GET } from "../app/api/recall/route";

const MAYA = "11111111-1111-4111-8111-111111111111";
const ELENA = "22222222-2222-4222-8222-222222222222";
const EVENT = "33333333-3333-4333-8333-333333333333";
const PREVIOUS = "44444444-4444-4444-8444-444444444444";
const PNG = Buffer.from("89504e470d0a1a0a", "hex"); // Header stub is only for mocked media boundary tests.
const mem = (id: string, owner: string): MemoryRow => ({
  id, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", contributor_id: owner, kind: "story", media_path: null,
  transcript: "Nora bakes lemon cake every Sunday.", caption: null, summary: "not source truth",
  source_question_id: null, created_at: "2026-01-01", source: { type: "human" },
  verified_facts: [{ id: id + "-fact", subjectNodeId: "nora", contributorId: owner, memoryId: id, text: "Nora bakes lemon cake every Sunday." }],
});
function support(owner: string, id: string): KeeperResult {
  return { keeperId: owner, claim: { subjectNodeId: "nora", label: "Nora" }, memoryIds: [id], v: 1, r: 1, support: "supports", reason: "",
    evidence: [{ memoryId: id, contributorId: owner, subjectNodeId: "nora", source: "human", supportedFacts: ["Nora bakes lemon cake every Sunday."] }] };
}
function database() {
  const state = {
    updates: [] as Record<string, unknown>[], inserts: 0,
    errorTable: "", failSpeak: false, failEveryUpdate: false, storageError: false,
    authError: false, replayFamily: "670f5075-c286-4b29-8074-86401c18d0c0", memories: [mem("m1", MAYA), mem("m2", ELENA)],
  };
  const sb = {
    auth: { getUser: async (token: string) => ({ data: { user: state.authError || token !== "session" ? null : { id: "user", app_metadata: { kin_family_id: "670f5075-c286-4b29-8074-86401c18d0c0", kin_contributor_id: MAYA } } }, error: null }) },
    from(table: string) {
      let operation = "read";
      let columns = "*";
      let payload: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const resolve = () => {
        // Model a project that has only migrations 001–006 applied.
        if (table === "relatives" && columns.split(",").includes("is_self")) return { data: null, error: { code: "42703" } };
        if (table === state.errorTable) return { data: null, error: { code: "DB_ERROR" } };
        if (table === "graph_nodes") return { data: [{ id: "nora", label: "Nora" }], error: null };
        if (table === "relatives") return { data: [{ id: MAYA, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", name: "Maya", color: "gold" }, { id: ELENA, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", name: "Elena", color: "pink" }], error: null };
        if (table === "memories") return { data: state.memories, error: null };
        if (table === "recall_events") {
          if (operation === "insert") { state.inserts++; return { data: [{ id: EVENT }], error: null }; }
          if (operation === "update") {
            state.updates.push(payload);
            if (state.failEveryUpdate || (state.failSpeak && payload.status === "speak")) return { data: null, error: { code: "WRITE_FAILED" } };
            return { data: [{ id: EVENT }], error: null };
          }
          if (filters.id === PREVIOUS) return { data: state.replayFamily === filters.family_id ? [{ id: PREVIOUS, snapshot_path: "670f5075-c286-4b29-8074-86401c18d0c0/previous.png" }] : [], error: null };
          return { data: [{ id: EVENT }], error: null };
        }
        return { data: [], error: null };
      };
      const b: Record<string, unknown> = {};
      for (const method of ["select", "in", "order", "limit"]) b[method] = () => b;
      b.select = (selected = "*") => { columns = selected; return b; };
      b.eq = (name: string, value: unknown) => { filters[name] = value; return b; };
      b.insert = (row: Record<string, unknown>) => { operation = "insert"; payload = row; return b; };
      b.update = (row: Record<string, unknown>) => { operation = "update"; payload = row; return b; };
      b.single = b.maybeSingle = async () => { const r = resolve(); return { ...r, data: r.data?.[0] ?? null }; };
      b.then = (resolvePromise: (value: unknown) => void) => Promise.resolve(resolve()).then(resolvePromise);
      return b;
    },
    storage: { from: () => ({
      upload: async () => ({ data: {}, error: state.storageError ? {} : null }),
      download: async () => ({ data: new Blob([PNG], { type: "image/png" }), error: null }),
    }) },
  };
  h.sb = sb;
  return state;
}
function request(extra?: [string, string], auth = true) {
  const form = new FormData();
  form.set("snapshot", new Blob([PNG], { type: "image/png" }), "snapshot.png");
  if (extra) form.set(...extra);
  return new Request("http://localhost/api/recall", { method: "POST", body: form, headers: auth ? { authorization: "Bearer session" } : {} });
}
beforeEach(() => {
  vi.clearAllMocks();
  h.face = { status: "matched", subjectNodeId: "nora", model: "canonical", enrollmentIds: ["e"], distance: .3, v: 1 };
  h.keepers = [support(MAYA, "m1"), support(ELENA, "m2")]; h.keeperError = false;
  h.caption.mockResolvedValue({ caption: "a kitchen", objects: ["cake"], setting: "indoors" });
  h.embed.mockResolvedValue(new Array(1536).fill(.01));
  h.rewrite.mockResolvedValue({ factIds: ["invented"], cue: "You two visited Rome." });
  h.tts.mockResolvedValue(Buffer.from("mock-audio"));
  h.recognize.mockImplementation(async () => h.face);
});
describe("authenticated image-first recall", () => {
  it("speaks only a literal grounded cue and persists matching terminal gate", async () => {
    const db = database(); const res = await POST(request()); const body = await res.json();
    expect(res.status).toBe(200); expect(body.decision).toBe("speak");
    expect(body.cueText).toBe("A relative said: “Nora bakes lemon cake every Sunday.”");
    expect(body.evidence[0].source).toBe("human"); expect(body.scores.C).toBeCloseTo(.95);
    expect(db.updates.at(-1)).toMatchObject({ status: "speak", gate: { decision: "speak" }, cue_text: body.cueText });
    expect(h.rewrite.mock.calls[0][0].user).not.toContain("not source truth");
  });
  it.each(["no_face", "unknown", "ambiguous", "unavailable"] as const)("silences %s without synthesis/TTS", async status => {
    database(); h.face = { status, model: "canonical" };
    const body = await (await POST(request())).json();
    expect(body.decision).toBe("silent"); expect(body.reasonCode).toBeTruthy();
    expect(h.caption).not.toHaveBeenCalled(); expect(h.rewrite).not.toHaveBeenCalled(); expect(h.tts).not.toHaveBeenCalled();
  });
  it("single-supporter silence never invokes the cue model or TTS", async () => {
    database(); h.keepers = h.keepers.slice(0, 1);
    expect((await (await POST(request())).json()).reasonCode).toBe("insufficient_evidence");
    expect(h.rewrite).not.toHaveBeenCalled(); expect(h.tts).not.toHaveBeenCalled();
  });
  it("rejects raw descriptors before creating any event", async () => {
    const db = database();
    expect((await POST(request(["faceDescriptors", "[]"]))).status).toBe(400);
    expect(db.inserts).toBe(0);
  });
  it("requires bearer authentication on POST and GET", async () => {
    const db = database();
    expect((await POST(request(undefined, false))).status).toBe(401);
    expect((await GET(new Request("http://localhost/api/recall"))).status).toBe(401);
    expect(db.inserts).toBe(0);
  });
  it("replay is family scoped and re-runs canonical recognition", async () => {
    const db = database();
    const replay = () => new Request("http://localhost/api/recall", { method: "POST", headers: { authorization: "Bearer session", "content-type": "application/json" }, body: JSON.stringify({ replayEventId: PREVIOUS }) });
    db.replayFamily = "other"; expect((await POST(replay())).status).toBe(404);
    expect(db.inserts).toBe(0);
    db.replayFamily = "670f5075-c286-4b29-8074-86401c18d0c0"; expect((await POST(replay())).status).toBe(200);
    expect(h.recognize).toHaveBeenCalledTimes(1);
  });
  it("provider rejection and resolved database errors finalize silently", async () => {
    let db = database(); h.caption.mockRejectedValueOnce(new Error("secret body must never escape"));
    let body = await (await POST(request())).json();
    expect(body.reasonCode).toBe("provider_failure"); expect(JSON.stringify(body)).not.toContain("secret body");
    expect(db.updates.at(-1)?.status).toBe("silent");
    db = database(); db.errorTable = "memories";
    body = await (await POST(request())).json();
    expect(body.reasonCode).toBe("provider_failure");
    expect(db.updates.at(-1)).toMatchObject({ status: "silent", gate: { decision: "silent" } });
  });
  it("storage failure terminates the created event", async () => {
    const db = database(); db.storageError = true;
    expect((await (await POST(request())).json()).reasonCode).toBe("provider_failure");
    expect(db.updates.at(-1)?.status).toBe("silent");
  });
  it("failed speak persistence cannot return a spoken cue or contradictory gate", async () => {
    const db = database(); db.failSpeak = true;
    const body = await (await POST(request())).json();
    expect(body.decision).toBe("silent");
    expect(db.updates.at(-1)).toMatchObject({ status: "silent", cue_text: null, gate: { decision: "silent" } });
  });
  it("database outage reports unavailable terminal persistence honestly", async () => {
    const db = database(); db.failEveryUpdate = true;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).eventId).toBe(EVENT);
  });
  it("grounding failure is terminal SILENT and skips TTS", async () => {
    const db = database(); db.memories = [];
    expect((await (await POST(request())).json()).reasonCode).toBe("grounding_failure");
    expect(h.tts).not.toHaveBeenCalled();
    expect(db.updates.at(-1)).toMatchObject({ status: "silent", gate: { decision: "silent" } });
  });
  it("TTS-only failure preserves verified text with null audio", async () => {
    database(); h.tts.mockRejectedValueOnce(new Error("timeout"));
    const body = await (await POST(request())).json();
    expect(body.decision).toBe("speak"); expect(body.audio).toBeNull();
  });
});
