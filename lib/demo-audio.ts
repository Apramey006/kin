import baseline from "../demo/shared-baseline.json";
import { DEMO_FAMILY_ID } from "./demo";
import { validAudioSegments, type AudioSegment } from "./living-stories";
import type { MemoryRow } from "./types";

/** Only unchanged, known fictional scripts without existing audio are eligible. */
export function isDemoNarrationCandidate(memory: MemoryRow) {
  return memory.family_id === DEMO_FAMILY_ID && memory.kind === "story" && !memory.media_path &&
    (!memory.source || memory.source.reenacted === true) && baseline.memories.some(script =>
      script.id === memory.id && script.contributor_id === memory.contributor_id &&
      script.transcript === memory.transcript && script.kind === "story");
}

export function narrationSegments(transcript: string, alignment: {
  characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[];
}): AudioSegment[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  if (characters.join("") !== transcript || starts.length !== characters.length || ends.length !== characters.length) return [];
  // Provider indices count Unicode characters; JS sentence offsets count UTF-16 units.
  const offsets = new Map<number, number>();
  let offset = 0;
  characters.forEach((character, index) => { offsets.set(offset, index); offset += character.length; });
  offsets.set(offset, characters.length);
  const segments: AudioSegment[] = [];
  for (const match of transcript.matchAll(/[^.!?]+[.!?]*/g)) {
    const text = match[0].trim();
    if (!text) continue;
    const from = match.index + match[0].indexOf(text);
    const first = offsets.get(from), after = offsets.get(from + text.length);
    if (first === undefined || after === undefined) return [];
    segments.push({ start: starts[first], end: ends[after - 1], text });
  }
  return validAudioSegments(segments, transcript);
}
