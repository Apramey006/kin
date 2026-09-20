import { describe, it, expect } from "vitest";
import { evaluateGate } from "../lib/gate";
import type { FaceOutcome, KeeperResult } from "../lib/types";

const face: FaceOutcome = { status: "matched", subjectNodeId: "nora", model: "canonical", enrollmentIds: ["e"], distance: .3, v: 1 };
const keeper = (id: string, r = 1): KeeperResult => ({
  keeperId: id, claim: { subjectNodeId: "nora", label: "Nora" },
  memoryIds: [id + "-story"], v: 1, r, support: "supports", reason: "human story",
  evidence: [{ memoryId: id + "-story", contributorId: id, subjectNodeId: "nora", source: "human", supportedFacts: ["Nora bakes lemon cake on Sundays."] }],
});
describe("conservative gate", () => {
  it("speaks with two distinct strong human supporters using the frozen formula", () => {
    const g = evaluateGate([keeper("maya", .91), keeper("elena", .88)], { face: { ...face, v: .93 } });
    expect(g.decision).toBe("speak");
    expect(g.C).toBeCloseTo(.89925);
    expect(g.threshold).toBe(.85);
  });
  it("single strongest possible contributor remains silent", () => {
    expect(evaluateGate([keeper("maya")], { face }).reasonCode).toBe("insufficient_evidence");
  });
  it("duplicate contributors do not establish independence", () => {
    expect(evaluateGate([keeper("maya"), keeper("maya")], { face }).reasonCode).toBe("insufficient_evidence");
  });
  it("two enrollment-only claims have no provenance", () => {
    const a = keeper("maya"); a.evidence = [];
    expect(evaluateGate([a, keeper("elena")], { face }).reasonCode).toBe("no_provenance");
  });
  it("rejects foreign owner or subject provenance", () => {
    const a = keeper("maya"); a.evidence[0].contributorId = "elena";
    expect(evaluateGate([a, keeper("elena")], { face }).reasonCode).toBe("no_provenance");
    a.evidence[0].contributorId = "maya"; a.evidence[0].subjectNodeId = "other";
    expect(evaluateGate([a, keeper("elena")], { face }).reasonCode).toBe("no_provenance");
  });
  it("explicit contradiction is a hard stop", () => {
    const a = keeper("david"); a.support = "contradicts";
    expect(evaluateGate([keeper("maya"), keeper("elena"), a], { face }).reasonCode).toBe("contradiction");
  });
  it("different subject claims cannot be pooled", () => {
    const a = keeper("david"); a.claim!.subjectNodeId = "sam";
    expect(evaluateGate([keeper("maya"), a], { face }).reasonCode).toBe("contradiction");
  });
  it("low semantic evidence remains below threshold", () => {
    const g = evaluateGate([keeper("maya", 0), keeper("elena", 0)], { face });
    expect(g.reasonCode).toBe("below_threshold");
    expect(g.R).toBe(0);
  });
  it.each(["no_face", "unknown", "ambiguous", "unavailable"] as const)("hard-silences %s", status => {
    expect(evaluateGate([keeper("maya"), keeper("elena")], { face: { status, model: "canonical" } }).decision).toBe("silent");
  });
  it("critical failures and non-finite scores cannot speak", () => {
    expect(evaluateGate([keeper("maya"), keeper("elena")], { face, providerFailure: true }).reasonCode).toBe("provider_failure");
    expect(evaluateGate([keeper("maya", NaN), keeper("elena")], { face }).reasonCode).toBe("provider_failure");
  });
});
