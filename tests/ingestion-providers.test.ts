import { afterEach, describe, expect, it, vi } from "vitest";

const chatJSON = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/openai", () => ({ chatJSON }));
import { extractMemory } from "../lib/extract";
import { transcribeAudio } from "../lib/providers/deepgram";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("ingestion provider contracts", () => {
  it("includes question context and grounding rules in extraction", async () => {
    chatJSON.mockResolvedValue({ summary: "Nora's mother taught her.", nodes: [], edges: [] });
    await extractMemory({ text: "It was her mother.", questionContext: "Who taught Nora the lemon cake recipe?",
      wearerName: "Rosa", contributorName: "David", contributorRelation: "son", existingNodes: [] });
    expect(chatJSON.mock.calls[0][0].user).toContain("Who taught Nora the lemon cake recipe?");
    expect(chatJSON.mock.calls[0][0].user).toContain("It was her mother.");
    expect(chatJSON.mock.calls[0][0].system).toContain("not evidence that its premise is true");
  });
  it("transcribes mobile audio with a bounded request", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ results: { channels: [{ alternatives: [{ transcript: " Story. " }] }] } })));
    expect(await transcribeAudio(Buffer.from("audio"), "audio/mp4")).toBe("Story.");
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal), headers: { Authorization: "Token test-secret", "Content-Type": "audio/mp4" } }));
  });
  it("does not expose provider response bodies on errors", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive provider details", { status: 500 })));
    await expect(transcribeAudio(Buffer.from("audio"), "audio/mp4")).rejects.toThrow(/^Deepgram error 500$/);
  });
  it("handles empty speech and malformed provider transcripts", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ results: { channels: [] } }))
      .mockResolvedValueOnce(Response.json({ results: { channels: [{ alternatives: [{ transcript: 12 }] }] } })));
    expect(await transcribeAudio(Buffer.from("audio"), "audio/mp4")).toBe("");
    await expect(transcribeAudio(Buffer.from("audio"), "audio/mp4")).rejects.toThrow("Invalid Deepgram response");
  });
});
