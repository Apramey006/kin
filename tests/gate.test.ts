import { describe, it, expect } from "vitest";
import { evaluateGate, type GateInfo } from "../lib/gate";
import type { KeeperResult } from "../lib/types";

const keeper = (
  id: string,
  claim: { subjectNodeId: string; label: string } | null,
  v: number,
  r: number,
  memoryIds: string[] = []
): KeeperResult => ({ keeperId: id, claim, memoryIds, v, r, reason: "" });

// Every cited memory is owned by its keeper and the subject has provenance.
const infoFor = (
  owners: Record<string, string>,
  kinds: Record<string, string> = {},
  subjects: string[] = ["nora"]
): GateInfo => ({
  memoryOwners: owners,
  memoryKinds: kinds,
  subjectProvenance: Object.fromEntries(subjects.map((s) => [s, true])),
});

describe("gatekeeper", () => {
  it("worked example: two strong agreeing keepers SPEAK, C ≈ 0.899", () => {
    const results = [
      keeper("maya", { subjectNodeId: "nora", label: "Nora" }, 0.93, 0.91, ["m1"]),
      keeper("david", { subjectNodeId: "nora", label: "Nora" }, 0.89, 0.88, ["m2"]),
      keeper("elena", null, 0, 0.1),
    ];
    const gate = evaluateGate(
      results,
      infoFor({ m1: "maya", m2: "david" }, { m1: "photo", m2: "photo" })
    );
    expect(gate.decision).toBe("speak");
    expect(gate.C).toBeCloseTo(0.899, 2);
    expect(gate.V).toBeCloseTo(0.93);
    expect(gate.R).toBeCloseTo(0.895);
    expect(gate.A).toBe(1);
    expect(gate.S).toBe(1);
    expect(gate.X).toBe(0);
  });

  it("two keepers claiming different subjects is SILENT (keepers disagree)", () => {
    const results = [
      keeper("maya", { subjectNodeId: "nora", label: "Nora" }, 0.9, 0.9, ["m1"]),
      keeper("david", { subjectNodeId: "sam", label: "Sam" }, 0.9, 0.9, ["m2"]),
    ];
    const gate = evaluateGate(
      results,
      infoFor({ m1: "maya", m2: "david" }, {}, ["nora", "sam"])
    );
    expect(gate.decision).toBe("silent");
    expect(gate.reason).toBe("keepers disagree");
  });

  it("all abstain is SILENT (no reliable memory)", () => {
    const results = [
      keeper("maya", null, 0, 0.1),
      keeper("david", null, 0, 0.2),
    ];
    const gate = evaluateGate(results, infoFor({}));
    expect(gate.decision).toBe("silent");
    expect(gate.reason).toBe("no reliable memory");
  });

  it("single strong keeper SPEAKS (A=0.75)", () => {
    const results = [
      keeper("maya", { subjectNodeId: "nora", label: "Nora" }, 0.95, 0.9, ["m1"]),
      keeper("david", null, 0, 0),
      keeper("elena", null, 0, 0),
    ];
    const gate = evaluateGate(
      results,
      infoFor({ m1: "maya" }, { m1: "photo" })
    );
    expect(gate.decision).toBe("speak");
    expect(gate.A).toBe(0.75);
  });

  it("single weak keeper stays SILENT (below threshold)", () => {
    const results = [
      keeper("maya", { subjectNodeId: "nora", label: "Nora" }, 0.4, 0.4, ["m1"]),
    ];
    const gate = evaluateGate(
      results,
      infoFor({ m1: "maya" }, { m1: "photo" })
    );
    expect(gate.decision).toBe("silent");
    expect(gate.reason).toBe("below threshold");
  });

  it("claims without provenance are SILENT (no provenance)", () => {
    const results = [
      keeper("maya", { subjectNodeId: "nora", label: "Nora" }, 0.95, 0.9, ["m1"]),
      keeper("david", { subjectNodeId: "nora", label: "Nora" }, 0.95, 0.9, ["m2"]),
    ];
    // memories owned by someone else -> S = 0
    const gate = evaluateGate(
      results,
      infoFor({ m1: "elena", m2: "elena" }, { m1: "photo", m2: "photo" })
    );
    expect(gate.decision).toBe("silent");
    expect(gate.reason).toBe("no provenance");
  });
});
