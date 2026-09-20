import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ family: vi.fn(), transcribe: vi.fn(), insert: vi.fn(), extract: vi.fn(), apply: vi.fn() }));
vi.mock("../lib/auth/server", () => ({
  requireFamily: mocks.family,
  requireContributor: (actual: string | null, requested: string) => { if (!actual || actual !== requested) throw new Error("Wrong contributor"); },
  AccessError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
vi.mock("../lib/providers/deepgram", () => ({ transcribeTimedAudio: mocks.transcribe }));
vi.mock("../lib/providers/ai", () => ({ embedText: async () => [] }));
vi.mock("../lib/audio-segments", () => ({ insertTimedMemory: mocks.insert }));
vi.mock("../lib/extract", () => ({ extractMemory: mocks.extract, applyExtraction: mocks.apply }));
import { POST } from "../app/api/memories/story/route";
import { AccessError } from "../lib/auth/server";

const topicId = "44444444-4444-4444-8444-444444444444";
function request(topic = topicId) {
  const form = new FormData();
  form.append("file", new File(["audio"], "voice.webm", { type: "audio/webm" }));
  form.append("contributor_id", "maya"); form.append("topic_id", topic);
  return new Request("http://localhost/api/memories/story", { method: "POST", body: form });
}
describe("contributing to a Living Story", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects loved-one writes before transcription or storage", async () => {
    mocks.family.mockRejectedValue(new AccessError("Only contributors", 403));
    expect((await POST(request())).status).toBe(403);
    expect(mocks.family).toHaveBeenCalledWith({ contributor: true });
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });
  it("rejects missing or foreign topics before uploading anything", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    mocks.family.mockResolvedValue({ relativeId: "maya", familyId: "own-family", sb: { from: () => query } });
    expect((await POST(request())).status).toBe(404);
    expect(query.eq.mock.calls).toEqual([["id", topicId], ["family_id", "own-family"]]);
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect((await POST(request("not-a-uuid"))).status).toBe(400);
  });
  it("saves timings and attaches a short contribution without inventing an edge", async () => {
    const topic = { id: topicId, label: "Sunday cake", type: "tradition", family_id: "family", aliases: [], relation_to_wearer: null };
    const link = vi.fn().mockResolvedValue({ error: null });
    const nodeQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: topic, error: null }), data: [topic] };
    const personQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { name: "Maya", relation_to_wearer: "granddaughter" }, error: null }) };
    const upload = vi.fn().mockResolvedValue({ error: null });
    const sb = { from: (table: string) => table === "graph_nodes" ? nodeQuery : table === "provenance" ? { insert: link } : personQuery, storage: { from: () => ({ upload }) } };
    mocks.family.mockResolvedValue({ relativeId: "maya", familyId: "family", sb });
    const segments = [{ start: 0, end: 2, text: "It smelled wonderful." }];
    mocks.transcribe.mockResolvedValue({ transcript: "It smelled wonderful.", segments });
    mocks.extract.mockResolvedValue({ summary: "Maya remembers the smell.", nodes: [], edges: [] });
    mocks.insert.mockResolvedValue({ data: { id: "new-memory" }, error: null });
    mocks.apply.mockResolvedValue({ nodeIds: [], edgeIds: [], chips: [] });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(sb, expect.objectContaining({ contributor_id: "maya", transcript: "It smelled wonderful." }), segments);
    expect(link).toHaveBeenCalledWith({ memory_id: "new-memory", contributor_id: "maya", node_id: topicId });
    expect(mocks.extract).toHaveBeenCalledWith(expect.objectContaining({ questionTarget: { nodeId: topicId, gapType: "living_story" } }));
  });
});
