import { describe, it, expect } from "vitest";
import { synthesizeCue, excerpt, type CueMemory } from "../lib/synthesize";
import type { GraphNodeRow } from "../lib/types";

const nora: GraphNodeRow = { id: "nora", family_id: "demo", type: "person", label: "Nora", aliases: [], relation_to_wearer: "sister" };
const story: CueMemory = { id: "story", contributorName: "Maya", kind: "story", transcript: "Nora and Rosa baked lemon cake every Sunday.", created_at: "2026-09-19T10:00:00Z", answersContext: false };
const answer: CueMemory = { id: "answer", contributorName: "David", kind: "answer", transcript: "The lemon cake recipe came from their mother in Italy.", created_at: "2026-09-19T11:00:00Z", answersContext: true };

describe("recorded memory cues", () => {
  it("speaks the name, relationship, and an attributed exact excerpt", () => {
    const cue = synthesizeCue(nora, [story]);
    expect(cue.text).toBe('That\'s Nora, your sister. Maya remembers: “Nora and Rosa baked lemon cake every Sunday.”');
    expect(cue.source?.memoryId).toBe("story");
    expect(story.transcript).toContain(cue.source?.quote);
  });
  it("replaying after a relevant answer incorporates the new human detail", () => {
    const before = synthesizeCue(nora, [story]);
    const after = synthesizeCue(nora, [answer, story]);
    expect(before.text).not.toContain("Italy");
    expect(after.text).toContain("Italy");
    expect(after.source?.memoryId).toBe("answer");
    expect(answer.transcript).toContain(after.source?.quote);
  });
  it("prefers the relevant answer even when a newer ordinary story exists", () => {
    expect(synthesizeCue(nora, [answer, { ...story, created_at: "2026-09-19T12:00:00Z" }]).source?.memoryId).toBe("answer");
  });
  it("never invents a memory from a graph label or missing transcript", () => {
    const cue = synthesizeCue(nora, [{ ...story, transcript: null }]);
    expect(cue.text).toBe("That's Nora, your sister.");
    expect(cue.source).toBeNull();
  });
  it("keeps complete sentences within the spoken word budget", () => {
    expect(excerpt("We baked cake. Then we walked to the bakery together.", 4)).toBe("We baked cake.");
    expect(excerpt("This sentence cannot fit.", 2)).toBeNull();
  });
});
