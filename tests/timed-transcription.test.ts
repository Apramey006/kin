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
