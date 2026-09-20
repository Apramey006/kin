import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../lib/config";

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(), transcribeAudio: vi.fn(), embedText: vi.fn(), captionImage: vi.fn(), extractMemory: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getServiceClient: mocks.getServiceClient }));
vi.mock("@/lib/providers/deepgram", () => ({ transcribeAudio: mocks.transcribeAudio }));
vi.mock("@/lib/providers/openai", () => ({ embedText: mocks.embedText, captionImage: mocks.captionImage }));
vi.mock("@/lib/extract", () => ({ extractMemory: mocks.extractMemory }));
vi.mock("@/lib/auth/server", () => ({
  getAuthClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: { message: "no session" } }) },
  })),
}));

import { POST as photo } from "../app/api/memories/photo/route";
import { POST as story } from "../app/api/memories/story/route";
import { POST as answer } from "../app/api/weaver/answer/route";
import { POST as detect } from "../app/api/faces/detect/route";
import { POST as enroll } from "../app/api/faces/enroll/route";
import { FACE_MODEL } from "../lib/server-faces";

const contributorId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const personId = "20000000-0000-4000-8000-000000000001";
const questionId = "30000000-0000-4000-8000-000000000001";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH3sAAAAASUVORK5CYII=", "base64");
const wav = Buffer.from("RIFF0000WAVEfmt 00000000data0000");
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let events: string[];
let storageError: { statusCode: string } | null;
let commitError: { code: string } | null;
let rpc: ReturnType<typeof vi.fn>;
let storageUpload: ReturnType<typeof vi.fn>;
let getUser: ReturnType<typeof vi.fn>;

function request(kind: "photo" | "story" | "answer" = "photo", fields: Record<string, string> = {}, bytes = kind === "photo" ? png : wav, mime = kind === "photo" ? "image/png" : "audio/wav", headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), kind === "photo" ? "photo.png" : "recording.wav");
  form.set("contributor_id", contributorId);
  if (kind === "answer") form.set("question_id", questionId);
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return new Request("http://localhost/api/ingestion", { method: "POST", body: form, headers: { authorization: "Bearer valid", ...headers } });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.stubEnv("KIN_FACE_SERVICE_URL", "http://localhost:8100/detect");
  vi.stubEnv("KIN_FACE_SERVICE_TOKEN", "service-secret");
  vi.stubEnv("KIN_FACE_TOKEN_KEY", "ab".repeat(32));
  events = [];
  storageError = null;
  commitError = null;
  rows = {
    relatives: [{ id: contributorId, family_id: "demo", name: "David", relation_to_wearer: "son" }],
    wearer: [{ family_id: "demo", name: "Rosa" }],
    graph_nodes: [{ id: personId, family_id: "demo", type: "person", label: "Nora", aliases: [], relation_to_wearer: "sister" }],
    weaver_questions: [{ id: questionId, family_id: "demo", target_relative_id: contributorId, question_text: "Who taught Nora the lemon cake recipe?", status: "open" }],
    ingestion_receipts: [], memories: [], face_embeddings: [],
  };
  getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user", app_metadata: { kin_family_id: "demo", kin_contributor_id: contributorId } } }, error: null });
  storageUpload = vi.fn(async () => ({ error: storageError }));
  rpc = vi.fn(async (_name: string, args: { payload: Row }) => {
    if (commitError) return { data: null, error: commitError };
    const payload = args.payload;
    const existing = rows.ingestion_receipts.find((receipt) => receipt.id === payload.id);
    if (existing) return existing.request_hash === payload.request_hash
      ? { data: existing.response, error: null } : { data: null, error: { code: "23505" } };
    if (payload.memory) {
      const memory = payload.memory as Row;
      rows.memories.push(memory);
      events.push("memory");
      events.push("graph");
      if (memory.source_question_id) {
        rows.weaver_questions[0].status = "answered";
        rows.weaver_questions[0].answer_memory_id = memory.id;
        events.push("answered");
      }
    } else rows.face_embeddings.push(payload.face as Row);
    rows.ingestion_receipts.push(payload);
    return { data: payload.response, error: null };
  });
  mocks.getServiceClient.mockReturnValue({
    auth: { getUser }, rpc,
    storage: { from: () => ({ upload: storageUpload, download: vi.fn(async () => ({ data: new Blob([png], { type: "image/png" }), error: null })) }) },
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const data = () => (rows[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        maybeSingle: async () => ({ data: data()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(resolve),
      };
      return query;
    },
  });
  mocks.transcribeAudio.mockResolvedValue("It was her mother.");
  mocks.embedText.mockResolvedValue(Array(1536).fill(0.01));
  mocks.captionImage.mockResolvedValue({ caption: "Two people baking", objects: [], setting: "kitchen" });
  mocks.extractMemory.mockImplementation(async () => ({ summary: "Nora learned the recipe from her mother.", nodes: [
    { ref: `existing:${personId}`, type: "person", label: "Nora", relation_to_wearer: "sister" },
    { ref: "new:mother", type: "person", label: "Nora's mother", relation_to_wearer: null },
  ], edges: [{ from: `existing:${personId}`, rel: "taught_by", to: "new:mother" }] }));
});

describe("mobile memory routes", () => {
  it("persists a photo with human labels, original caption and provenance", async () => {
    const response = await photo(request("photo", { caption: "Nora baking", consent: "true", labels: JSON.stringify([{ person_node_id: personId }]) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.persons).toEqual([{ index: 0, node_id: personId }]);
    const payload = rpc.mock.calls[0][1].payload;
    expect(payload.source).toMatchObject({ type: "human", caption: "Nora baking", consent: true });
    expect(payload.memory).toMatchObject({ contributor_id: contributorId, kind: "photo", caption: "Two people baking" });
    expect(payload.provenance).toEqual(expect.arrayContaining([expect.objectContaining({ node_id: personId, contributor_id: contributorId })]));
    expect(mocks.extractMemory.mock.calls[0][0].text).not.toContain("Two people baking");
  });

  it.each(["image/heic", "text/plain", "application/octet-stream"])("rejects unsupported MIME %s", async (mime) => {
    expect((await photo(request("photo", {}, png, mime))).status).toBe(415);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects an oversized upload", async () => {
    expect((await photo(request("photo", {}, Buffer.alloc(CONFIG.maxUploadBytes + 1)))).status).toBe(413);
    expect(storageUpload).not.toHaveBeenCalled();
  });
  it("rejects fake image and audio contents", async () => {
    expect((await photo(request("photo", {}, Buffer.from("not a png")))).status).toBe(422);
    expect((await story(request("story", {}, Buffer.from("not audio")))).status).toBe(422);
  });
  it("requires authentication before providers", async () => {
    expect((await story(request("story", {}, wav, "audio/wav", { authorization: "" }))).status).toBe(401);
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });
  it("rejects unverified sessions and missing provisioned membership", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: {} });
    expect((await story(request("story"))).status).toBe(401);
    getUser.mockResolvedValueOnce({ data: { user: { id: "user", app_metadata: {} } }, error: null });
    expect((await story(request("story"))).status).toBe(403);
  });
  it("rejects contributor impersonation and cross-family requests", async () => {
    expect((await photo(request("photo", { contributor_id: otherId }))).status).toBe(403);
    expect((await photo(request("photo", { family_id: "other-family" }))).status).toBe(403);
    expect((await photo(request("photo", { consent: "true", labels: JSON.stringify([{ person_node_id: otherId }]) }))).status).toBe(403);
  });
  it("rejects malformed IDs, labels and missing consent", async () => {
    expect((await photo(request("photo", { contributor_id: "nope" }))).status).toBe(400);
    expect((await photo(request("photo", { labels: "{" }))).status).toBe(400);
    expect((await photo(request("photo", { labels: JSON.stringify([{ person_node_id: personId }]) }))).status).toBe(400);
  });
  it("stores a voice story with transcript and a graph", async () => {
    const response = await story(request("story"));
    expect(response.status).toBe(200);
    expect((await response.json()).transcript).toBe("It was her mother.");
    expect(rpc.mock.calls[0][1].payload.edges).toEqual([expect.objectContaining({ rel: "taught_by" })]);
    expect(events).toEqual(["memory", "graph"]);
  });
  it.each(["transcribeAudio", "extractMemory", "embedText"] as const)("%s failure creates no partial memory or uploaded media", async (provider) => {
    mocks[provider].mockRejectedValueOnce(new Error("Provider secret should not be exposed"));
    const response = await story(request("story"));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("Provider secret");
    expect(storageUpload).not.toHaveBeenCalled();
    expect(rows.memories).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects empty transcripts and failed uploads", async () => {
    mocks.transcribeAudio.mockResolvedValueOnce(" ");
    expect((await story(request("story"))).status).toBe(422);
    storageError = { statusCode: "500" };
    expect((await story(request("story"))).status).toBe(502);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([Array(1535).fill(0.1), [...Array(1535).fill(0.1), Infinity], Array(1536).fill(0)])("rejects invalid embeddings without persistence", async (embedding) => {
    mocks.embedText.mockResolvedValueOnce(embedding);
    expect((await story(request("story"))).status).toBe(502);
    expect(storageUpload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts a mobile M4A container", async () => {
    const audio = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 77, 52, 65, 32]);
    expect((await story(request("story", {}, audio, "audio/mp4"))).status).toBe(200);
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(audio, "audio/mp4");
  });
  it("retries return the original memory without calling providers again", async () => {
    const first = await (await story(request("story"))).json();
    const second = await (await story(request("story"))).json();
    expect(second).toEqual(first);
    expect(rows.memories).toHaveLength(1);
    expect(mocks.transcribeAudio).toHaveBeenCalledTimes(1);
  });
  it("concurrent retries have one logical memory", async () => {
    const responses = await Promise.all([story(request("story")), story(request("story"))]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(rows.memories).toHaveLength(1);
  });
  it("rejects changed content with the same idempotency key", async () => {
    await story(request("story", {}, wav, "audio/wav", { "idempotency-key": "same" }));
    expect((await story(request("story", {}, Buffer.concat([wav, Buffer.from("changed")]), "audio/wav", { "idempotency-key": "same" }))).status).toBe(409);
    expect(rows.memories).toHaveLength(1);
  });
  it("passes the original Weaver question and commits memory, graph, then answered", async () => {
    expect((await answer(request("answer"))).status).toBe(200);
    expect(mocks.extractMemory).toHaveBeenCalledWith(expect.objectContaining({ text: "It was her mother.", questionContext: "Who taught Nora the lemon cake recipe?" }));
    expect(events).toEqual(["memory", "graph", "answered"]);
    expect((await answer(request("answer"))).status).toBe(200);
    expect(rows.memories).toHaveLength(1);
  });
  it("failed Weaver persistence leaves the question unanswered and can retry", async () => {
    commitError = { code: "database_failure" };
    expect((await answer(request("answer"))).status).toBe(502);
    expect(rows.weaver_questions[0].status).toBe("open");
    expect(rows.memories).toHaveLength(0);
    commitError = null;
    storageError = { statusCode: "409" };
    expect((await answer(request("answer"))).status).toBe(200);
    expect(rows.memories).toHaveLength(1);
  });
  it("Weaver transcription failure leaves no memory and question open", async () => {
    mocks.transcribeAudio.mockRejectedValueOnce(new Error("Unavailable"));
    expect((await answer(request("answer"))).status).toBe(502);
    expect(rows.weaver_questions[0].status).toBe("open");
    expect(rpc).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });
  it("fails clearly when the atomic RPC is not deployed", async () => {
    commitError = { code: "PGRST202" };
    expect((await answer(request("answer"))).status).toBe(503);
    expect(rows.weaver_questions[0].status).toBe("open");
  });
  it("rejects questions belonging to another family or relative", async () => {
    rows.weaver_questions[0].family_id = "other";
    expect((await answer(request("answer"))).status).toBe(404);
    rows.weaver_questions[0].family_id = "demo";
    rows.weaver_questions[0].target_relative_id = otherId;
    expect((await answer(request("answer"))).status).toBe(403);
  });
});

describe("mobile face routes", () => {
  function inference(count: number) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ model: FACE_MODEL, width: 100, height: 100,
      faces: Array.from({ length: count }, (_, index) => ({ box: { x: index * 20, y: 0, width: 10, height: 10 }, descriptor: Array(128).fill(0.1 + index) })) })));
  }
  it.each([0, 1, 2])("returns %i detected faces without exposing descriptors", async (count) => {
    inference(count);
    const response = await detect(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.faces).toHaveLength(count);
    for (const face of body.faces) {
      expect(face.temporaryFaceId).toEqual(expect.any(String));
      expect(face.box.width).toBe(10);
      expect(face.descriptor).toBeUndefined();
    }
  });
  it("enrolls the selected server descriptor with consent and deduplicates retries", async () => {
    inference(2);
    const faces = (await (await detect(request())).json()).faces;
    const memory = await (await photo(request())).json();
    const body = { person_node_id: personId, contributor_id: contributorId, memory_id: memory.memory_id, temporaryFaceId: faces[1].temporaryFaceId, consent: true };
    const send = (value: unknown) => enroll(new Request("http://localhost/api/faces/enroll", { method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: JSON.stringify(value) }));
    expect((await send({ ...body, consent: false })).status).toBe(400);
    expect((await send({ ...body, consent: undefined })).status).toBe(400);
    expect((await send({ ...body, descriptor: Array(128).fill(0) })).status).toBe(400);
    expect((await send(body)).status).toBe(200);
    expect(rows.face_embeddings[0].descriptor).toEqual(Array(128).fill(1.1));
    expect((await send(body)).status).toBe(200);
    expect(rows.face_embeddings).toHaveLength(1);
    expect((await send({ ...body, temporaryFaceId: "forged" })).status).toBe(422);
    expect((await send({ ...body, person_node_id: otherId })).status).toBe(403);
  });
});
