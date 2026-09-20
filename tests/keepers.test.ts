import { describe, it, expect } from "vitest";
import { buildKeeperResult, faceScore, type KeeperInput } from "../lib/keepers";
import { evaluateGate } from "../lib/gate";
import type { Keeper } from "../lib/types";

const maya: Keeper = { relativeId: "maya", name: "Maya", color: "#E0A458" };
const input: KeeperInput = {
  faceMatches: [{ person_node_id: "nora", contributor_id: "maya", memory_id: "photo", distance: 0.3 }],
  nodeLabels: { nora: "Nora", stranger: "Stranger" },
  memoryOwners: { photo: "maya", story: "maya", foreign: "david" },
  personLinkedMemories: [{ id: "photo", summary: "Nora's photo" }, { id: "story", summary: "Nora baked cake" }],
};

describe("enrolled face retrieval", () => {
  it("maps distance to a bounded score and rejects nonfinite values", () => {
    expect(faceScore(0.35)).toBe(1);
    expect(faceScore(0.6)).toBe(0);
    expect(faceScore(NaN)).toBe(0);
  });
  it("cites only the Keeper's memories linked to the recognized person", () => {
    const result = buildKeeperResult(maya, { ...input,
      faceMatches: [...input.faceMatches, { person_node_id: "stranger", contributor_id: "david", memory_id: "foreign", distance: 0.1 }],
      personLinkedMemories: [...input.personLinkedMemories, { id: "foreign", summary: "David's story" }],
    });
    expect(result.claim?.subjectNodeId).toBe("nora");
    expect(result.memoryIds).toEqual(["photo", "story"]);
    expect(result.r).toBe(1);
  });
  it("does not identify an unknown face using available stories", () => {
    const result = buildKeeperResult(maya, { ...input, faceMatches: [{ ...input.faceMatches[0], distance: 0.62 }] });
    expect(result.claim).toBeNull();
    expect(result.memoryIds).toEqual([]);
  });
  it("stays silent with no detected face", () => {
    expect(buildKeeperResult(maya, { ...input, faceMatches: [] }).claim).toBeNull();
  });
  it("abstains when two different identities have similar distances", () => {
    const result = buildKeeperResult(maya, { ...input, faceMatches: [
      ...input.faceMatches, { person_node_id: "stranger", contributor_id: "maya", memory_id: "other", distance: 0.32 },
    ] });
    expect(result.claim).toBeNull();
    expect(result.reason).toContain("more than one person");
  });
  it("abstains when the enrollment source does not belong to this relative", () => {
    expect(buildKeeperResult(maya, { ...input, memoryOwners: { photo: "david" } }).claim).toBeNull();
  });
  it("abstains when the enrollment's photo is not linked to the recognized person", () => {
    expect(buildKeeperResult(maya, { ...input, personLinkedMemories: [] }).claim).toBeNull();
  });
  it("two relatives recognize an enrolled face, while the same family stays silent for a stranger", () => {
    const family = ["maya", "elena"];
    const recall = (distance: number) => {
      const results = family.map((id) => buildKeeperResult({ ...maya, relativeId: id }, {
        ...input, faceMatches: [{ person_node_id: "nora", contributor_id: id, memory_id: id, distance }],
        memoryOwners: { [id]: id }, personLinkedMemories: [{ id, summary: "An enrolled photo of Nora" }],
      }));
      return evaluateGate(results, { memoryOwners: { maya: "maya", elena: "elena" }, memoryKinds: { maya: "photo", elena: "photo" }, subjectProvenance: { nora: true } });
    };
    expect(recall(0.35).decision).toBe("speak");
    expect(recall(0.425).decision).toBe("speak");
    expect(recall(0.62).decision).toBe("silent");
  });
});
