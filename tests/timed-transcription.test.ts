import { afterEach, expect, it, vi } from "vitest";
import { transcribeTimedAudio } from "../lib/providers/deepgram";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("retains verified utterance timestamps from the original transcription", async () => {
  vi.stubEnv("DEEPGRAM_API_KEY", "test-key");
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: {
    channels: [{ alternatives: [{ transcript: "Lemon cake. A family tradition." }] }],
    utterances: [{ start: 0, end: 2, transcript: "Lemon cake." }, { start: 3, end: 5, transcript: "A family tradition." }],
  } })));
  vi.stubGlobal("fetch", fetch);
  expect(await transcribeTimedAudio(Buffer.from("audio"), "audio/webm")).toEqual({
    transcript: "Lemon cake. A family tradition.", segments: [{ start: 0, end: 2, text: "Lemon cake." }, { start: 3, end: 5, text: "A family tradition." }],
  });
  expect(fetch.mock.calls[0][0]).toContain("utterances=true");
});
it("keeps the full transcript when provider timings cannot be verified", async () => {
  vi.stubEnv("DEEPGRAM_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: {
    channels: [{ alternatives: [{ transcript: "Lemon cake." }] }],
    utterances: [{ start: 0, end: 2, transcript: "Different text." }],
  } }))));
  expect(await transcribeTimedAudio(Buffer.from("audio"), "audio/webm")).toEqual({ transcript: "Lemon cake.", segments: [] });
});

it("hints family names without rewriting similar names in the provider transcript", async () => {
  vi.stubEnv("DEEPGRAM_API_KEY", "test-key");
  const fetch = vi.fn().mockResolvedValue(Response.json({ results: {
    channels: [{ alternatives: [{ transcript: "Eleanor went to church." }] }],
  } }));
  vi.stubGlobal("fetch", fetch);
  const result = await transcribeTimedAudio(Buffer.from("audio"), "audio/webm", [" Elena ", "Elena", "", "Maya", "李娜", "A&B"]);
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.searchParams.get("model")).toBe("nova-3");
  expect(url.searchParams.getAll("keyterm")).toEqual(["Elena", "Maya", "李娜", "A&B"]);
  expect(result.transcript).toBe("Eleanor went to church.");
});
it("bounds transcription hints for large family graphs", async () => {
  vi.stubEnv("DEEPGRAM_API_KEY", "test-key");
  const fetch = vi.fn().mockResolvedValue(Response.json({ results: { channels: [] } }));
  vi.stubGlobal("fetch", fetch);
  await transcribeTimedAudio(Buffer.from("audio"), "audio/webm", Array.from({length: 200}, (_, i) => `Relative ${i}`));
  const names = new URL(fetch.mock.calls[0][0]).searchParams.getAll("keyterm");
  expect(names.length).toBeLessThanOrEqual(50);
  expect(names.reduce((sum, name) => sum + Buffer.byteLength(name), 0)).toBeLessThanOrEqual(400);
});
