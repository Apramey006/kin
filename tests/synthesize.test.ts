import { describe, it, expect, vi } from "vitest";
import { renderFacts, validateGrounding, synthesizeCue } from "../lib/synthesize";
import type { VerifiedFact } from "../lib/types";
const facts: VerifiedFact[] = [
  { id: "f1", subjectNodeId: "nora", memoryId: "m1", contributorId: "maya", text: "Nora bakes lemon cake every Sunday." },
  { id: "f2", subjectNodeId: "nora", memoryId: "m2", contributorId: "david", text: "The lemon cake recipe came from Nora’s mother." },
];
describe("exact fact grounding", () => {
  it("accepts only exact composition of selected facts", () => {
    expect(validateGrounding({ factIds: ["f2"], cue: renderFacts([facts[1]]) }, facts)).toBe(true);
  });
  it.each([
    "You two baked lemon cake every Sunday.",
    "nora won a baking prize.",
    "A relative said: “Nora is your mother.”",
    "A relative said: “Nora bakes lemon cake in 1972.”",
  ])("rejects invented lowercase claims, relationships, dates, and participation: %s", cue => {
    expect(validateGrounding({ factIds: ["f1"], cue }, facts)).toBe(false);
  });
  it("rejects valid words recombined into a false claim", () => {
    expect(validateGrounding({ factIds: ["f1", "f2"], cue: "Nora came from lemon cake." }, facts)).toBe(false);
  });
  it("rejects unknown or duplicate IDs", () => {
    expect(validateGrounding({ factIds: ["unknown"], cue: renderFacts([facts[0]]) }, facts)).toBe(false);
    expect(validateGrounding({ factIds: ["f1", "f1"], cue: renderFacts([facts[0], facts[0]]) }, facts)).toBe(false);
  });
  it("invalid model rewrite falls back to a literal attributed fact", async () => {
    const cue = await synthesizeCue({ facts, rewrite: async () => ({ factIds: ["f1"], cue: "You two loved Rome." }) });
    expect(cue.grounded).toBe(true); expect(cue.text).toBe(renderFacts([facts[0]]));
    expect(cue.text.split(/\s+/).length).toBeLessThanOrEqual(30);
  });
  it("model failure still permits an independently grounded local fallback", async () => {
    expect((await synthesizeCue({ facts, rewrite: async () => { throw new Error("offline"); } })).grounded).toBe(true);
  });
  it("no short verified fact fails closed without calling the model", async () => {
    const rewrite = vi.fn();
    expect((await synthesizeCue({ facts: [], rewrite })).grounded).toBe(false);
    expect((await synthesizeCue({ facts: [{ ...facts[0], text: "word ".repeat(40) }], rewrite })).grounded).toBe(false);
    expect(rewrite).not.toHaveBeenCalled();
  });
});
