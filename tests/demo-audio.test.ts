import { expect, it } from "vitest";
import baseline from "../demo/shared-baseline.json";
import { isDemoNarrationCandidate, narrationSegments } from "../lib/demo-audio";
import type { MemoryRow } from "../lib/types";

it("only selects unchanged fictional scripts without audio", () => {
  const memory = { ...baseline.memories.find(m => m.kind === "story")!, media_path: null } as MemoryRow;
  expect(isDemoNarrationCandidate(memory)).toBe(true);
  for (const changes of [
    { family_id: "other" }, { id: "other" }, { contributor_id: "other" },
    { transcript: "User edited this memory." }, { media_path: "real-recording.webm" },
    { source: { type: "human" as const } },
  ]) expect(isDemoNarrationCandidate({ ...memory, ...changes })).toBe(false);
});

it("uses actual provider timings for exact sentences, including Unicode", () => {
  const transcript = "Elena 🌷 planted tulips. Rosa watered them.";
  const characters = Array.from(transcript);
  const alignment = { characters,
    character_start_times_seconds: characters.map((_, i) => i * .1),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * .1),
  };
  const result = narrationSegments(transcript, alignment);
  expect(result.map(s => s.text)).toEqual(["Elena 🌷 planted tulips.", "Rosa watered them."]);
  expect(result[1].start).toBeCloseTo(Array.from("Elena 🌷 planted tulips. ").length * .1);
  expect(narrationSegments("Different words.", alignment)).toEqual([]);
  expect(narrationSegments(transcript, { ...alignment, character_end_times_seconds: [] })).toEqual([]);
});
