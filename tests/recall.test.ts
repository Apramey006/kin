import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KeeperResult } from "../lib/types";

const mocks = vi.hoisted(() => ({
  sb: null as unknown,
  keeperResults: [] as KeeperResult[],
  keepersError: null as Error | null,
  descriptorResult: null as {
    descriptors: number[][];
    model: string;
    source: "server" | "browser" | "none";
  } | null,
}));

vi.mock("@/lib/supabase", () => ({
  FAMILY_ID: "fam",
  getServiceClient: () => mocks.sb,
}));

vi.mock("@/lib/keepers", () => ({
  runKeepers: async () => {
    if (mocks.keepersError) throw mocks.keepersError;
    return mocks.keeperResults;
  },
}));

vi.mock("@/lib/providers/openai", () => ({
  captionImage: async () => null,
  embedText: async () => new Array(1536).fill(0),
  chatJSON: async () => ({ sentence: "a rewritten cue" }),
}));

vi.mock("@/lib/providers/elevenlabs", () => ({
  synthesizeSpeech: async () => Buffer.from("mp3"),
}));

vi.mock("@/lib/faces-server", () => ({
  BROWSER_FACE_MODEL: "browser-face-api-1.7.15",
  resolveDescriptors: async (
    _snapshot: Buffer | null,
    _mime: string,
    client: number[][]
  ) =>
    mocks.descriptorResult ?? {
      descriptors: client,
      model: "browser-face-api-1.7.15",
      source: "browser",
    },
}));

import { POST } from "../app/api/recall/route";

type PlanEntry =
  | { data?: unknown; error?: unknown }
  | ((calls: { m: string; args: unknown[] }[]) => { data?: unknown; error?: unknown });

interface FakeSb {
  from: (table: string) => unknown;
  updates: { table: string; payload: Record<string, unknown> }[];
  inserts: { table: string; rows: unknown }[];
  storage: { from: () => unknown };
  rpc: () => Promise<{ data: unknown[]; error: null }>;
}

function makeSb(plan: Record<string, PlanEntry[]>): FakeSb {
  const updates: FakeSb["updates"] = [];
  const inserts: FakeSb["inserts"] = [];
  const counters: Record<string, number> = {};
  const from = (table: string) => {
    const calls: { m: string; args: unknown[] }[] = [];
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const entries = plan[table] ?? [];
    const resolve = () => {
      const entry = entries[Math.min(idx, entries.length - 1)];
      return typeof entry === "function" ? entry(calls) : entry ?? { data: [] };
    };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "neq", "is"]) {
      b[m] = (...args: unknown[]) => {
        calls.push({ m, args });
        return b;
      };
    }
    b.insert = (rows: unknown) => {
      calls.push({ m: "insert", args: [rows] });
      inserts.push({ table, rows });
      return b;
    };
    b.update = (payload: Record<string, unknown>) => {
      calls.push({ m: "update", args: [payload] });
      updates.push({ table, payload });
      return b;
    };
    b.single = () => {
      const r = resolve();
      const data = Array.isArray(r.data) ? (r.data[0] ?? null) : (r.data ?? null);
      return Promise.resolve({ data, error: r.error ?? null });
    };
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      const r = resolve();
      return Promise.resolve({ data: r.data ?? [], error: r.error ?? null }).then(res, rej);
    };
    return b;
  };
  return {
    from,
    updates,
    inserts,
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        download: async () => ({ data: null }),
      }),
    },
    rpc: async () => ({ data: [], error: null }),
  };
}

const keeper = (
  keeperId: string,
  subjectNodeId: string | null,
  v = 0,
  r = 0,
  memoryIds: string[] = []
): KeeperResult => ({
  keeperId,
  claim: subjectNodeId ? { subjectNodeId, label: "Nora" } : null,
  memoryIds,
  v,
  r,
  reason: "",
});

const noraNode = {
  id: "nora",
  family_id: "fam",
  type: "person",
  label: "Nora",
  aliases: [],
  relation_to_wearer: "sister",
};

const relatives = [
  { id: "a", name: "A", color: "#111" },
  { id: "b", name: "B", color: "#222" },
];

function recallRequest(descriptors: number[][] = [new Array(128).fill(0.1)]) {
  const form = new FormData();
  form.append("faceDescriptors", JSON.stringify(descriptors));
  return new Request("http://localhost/api/recall", {
    method: "POST",
    body: form,
  });
}

function basePlan(extra: Record<string, PlanEntry[]> = {}) {
  return {
    recall_events: [{ data: [{ id: "evt-1" }] }, ...new Array(8).fill({ data: [] })],
    relatives: [{ data: relatives }],
    memories: [{ data: [] }],
    provenance: [{ data: [] }, { data: [] }],
    graph_nodes: [{ data: [noraNode] }],
    graph_edges: [{ data: [] }],
    wearer: [{ data: [{ name: "Rosa" }] }],
    ...extra,
  };
}

let sb: FakeSb;

beforeEach(() => {
  mocks.keeperResults = [];
  mocks.keepersError = null;
  mocks.descriptorResult = null;
});

describe("POST /api/recall", () => {
  it("two agreeing strong keepers speak and close the event", async () => {
    sb = makeSb(
      basePlan({
        memories: [
          {
            data: [
              { id: "m1", kind: "photo", contributor_id: "a" },
              { id: "m2", kind: "photo", contributor_id: "b" },
            ],
          },
        ],
        provenance: [{ data: [{ node_id: "nora" }] }, { data: [] }],
      })
    );
    mocks.sb = sb;
    mocks.keeperResults = [
      keeper("a", "nora", 0.95, 0.9, ["m1"]),
      keeper("b", "nora", 0.9, 0.85, ["m2"]),
    ];
    const res = await POST(recallRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.decision).toBe("speak");
    const last = sb.updates.at(-1)!.payload;
    expect(last.status).toBe("speak");
    expect(typeof last.cue_text).toBe("string");
    expect((last.cue_text as string).length).toBeGreaterThan(0);
  });

  it("all abstain ends silent with no reliable memory", async () => {
    sb = makeSb(basePlan());
    mocks.sb = sb;
    mocks.keeperResults = [keeper("a", null), keeper("b", null)];
    const res = await POST(recallRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.decision).toBe("silent");
    expect(json.reason).toBe("no reliable memory");
    expect(sb.updates.at(-1)!.payload.status).toBe("silent");
  });

  it("disagreeing keepers end silent with keepers disagree", async () => {
    sb = makeSb(basePlan());
    mocks.sb = sb;
    mocks.keeperResults = [
      keeper("a", "nora", 0.9, 0.8, ["m1"]),
      keeper("b", "rosa", 0.9, 0.8, ["m2"]),
    ];
    const res = await POST(recallRequest());
    const json = await res.json();
    expect(json.decision).toBe("silent");
    expect(json.reason).toBe("keepers disagree");
  });

  it("a keeper failure returns 500 and the event ends silent with an error reason", async () => {
    sb = makeSb(basePlan());
    mocks.sb = sb;
    mocks.keepersError = new Error("keepers exploded");
    const res = await POST(recallRequest());
    expect(res.status).toBe(500);
    const last = sb.updates.at(-1)!.payload;
    expect(last.status).toBe("silent");
    expect(String(last.silence_reason)).toMatch(/^error/);
  });

  it("rejects descriptors that are not 128 numbers, before inserting", async () => {
    sb = makeSb(basePlan());
    mocks.sb = sb;
    const res = await POST(recallRequest([new Array(127).fill(0.1)]));
    expect(res.status).toBe(400);
    expect(sb.inserts).toHaveLength(0);
  });

  it("source none with abstaining keepers reports descriptorSource and ends silent", async () => {
    sb = makeSb(basePlan());
    mocks.sb = sb;
    mocks.descriptorResult = {
      descriptors: [],
      model: "face-api-1.7.15:test",
      source: "none",
    };
    mocks.keeperResults = [keeper("a", null), keeper("b", null)];
    const res = await POST(recallRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.decision).toBe("silent");
    expect(json.descriptorSource).toBe("none");
    expect(json.faceModel).toBe("face-api-1.7.15:test");
    expect(sb.updates.at(-1)!.payload.status).toBe("silent");
  });

  it("replay accepts legacy array-shaped face_descriptors", async () => {
    sb = makeSb(
      basePlan({
        recall_events: [
          {
            data: [
              {
                id: "evt-legacy",
                snapshot_path: null,
                face_descriptors: [new Array(128).fill(0.2)],
              },
            ],
          },
          { data: [{ id: "evt-legacy" }] },
          ...new Array(7).fill({ data: [] }),
        ],
      })
    );
    mocks.sb = sb;
    mocks.keeperResults = [keeper("a", null), keeper("b", null)];
    const res = await POST(
      new Request("http://localhost/api/recall", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replayEventId: "evt-legacy" }),
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.decision).toBe("silent");
  });

  it("replay with an event from another family returns 404", async () => {
    sb = makeSb(
      basePlan({
        recall_events: [
          (calls) =>
            calls.some(
              (c) => c.m === "eq" && c.args[0] === "family_id" && c.args[1] === "fam"
            )
              ? { data: null }
              : { data: [{ id: "evt-x" }] },
        ],
      })
    );
    mocks.sb = sb;
    const res = await POST(
      new Request("http://localhost/api/recall", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replayEventId: "evt-x" }),
      })
    );
    expect(res.status).toBe(404);
  });
});
