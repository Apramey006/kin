import { describe, it, expect } from "vitest";
import { buildKeeperResult, faceScore, simScore } from "../lib/keepers";
import type { Keeper } from "../lib/types";

const maya: Keeper = { relativeId: "maya", name: "Maya", color: "#E0A458" };

const baseInput = {
  nodeLabels: { nora: "Nora", book: "recipe book" },
  nodeTypes: { nora: "person", book: "object" },
  memoryOwners: {} as Record<string, string>,
  memoryNodeLinks: {} as Record<string, string[]>,
  personLinkedMemories: [] as { id: string; summary: string; similarity: number }[],
};

describe("keepers", () => {
  it("maps face distance and similarity onto 0..1 scores", () => {
    expect(faceScore(0.35)).toBe(1);
    expect(faceScore(0.6)).toBe(0);
    expect(faceScore(0.475)).toBeCloseTo(0.5);
    expect(simScore(0.2)).toBe(0);
    expect(simScore(0.6)).toBeCloseTo(1);
  });

  it("never returns memory IDs owned by another relative", () => {
    const result = buildKeeperResult(maya, {
      ...baseInput,
      faceMatches: [
        { person_node_id: "nora", contributor_id: "maya", memory_id: "maya-photo", distance: 0.3 },
        // an even better match owned by David must be ignored for Maya
        { person_node_id: "nora", contributor_id: "david", memory_id: "david-photo", distance: 0.1 },
      ],
      memoryOwners: {
        "maya-photo": "maya",
        "david-photo": "david",
        "maya-story": "maya",
        "david-story": "david",
      },
      memories: [
        { id: "david-story", summary: "David's", similarity: 0.9 }, // foreign, must be filtered
        { id: "maya-story", summary: "Maya's", similarity: 0.5 },
      ],
      memoryNodeLinks: {
        "maya-story": ["nora"],
        "david-story": ["nora"],
      },
      personLinkedMemories: [
        { id: "maya-story", summary: "Maya's", similarity: 0 },
        { id: "david-story", summary: "David's", similarity: 0 },
      ],
    });
    expect(result.claim?.subjectNodeId).toBe("nora");
    // face match uses maya's own enrollment (d=0.3), not david's better one
    expect(result.v).toBeCloseTo(faceScore(0.3));
    for (const id of result.memoryIds) {
      expect(id.startsWith("maya-")).toBe(true);
    }
    expect(result.memoryIds).toContain("maya-photo");
    expect(result.memoryIds).toContain("maya-story");
    expect(result.memoryIds).not.toContain("david-story");
    expect(result.memoryIds).not.toContain("david-photo");
  });

  it("abstains when there is no face and weak retrieval", () => {
    const result = buildKeeperResult(maya, {
      ...baseInput,
      faceMatches: [],
      memoryOwners: { m1: "maya" },
      memories: [{ id: "m1", summary: "s", similarity: 0.3 }],
      memoryNodeLinks: { m1: ["nora"] },
    });
    expect(result.claim).toBeNull();
    expect(result.v).toBe(0);
    expect(result.r).toBeLessThan(0.5);
  });

  it("claims an object/person from a strong text memory with no face", () => {
    const result = buildKeeperResult(maya, {
      ...baseInput,
      faceMatches: [],
      memoryOwners: { m1: "maya" },
      memories: [{ id: "m1", summary: "the recipe book", similarity: 0.7 }],
      memoryNodeLinks: { m1: ["book"] },
    });
    expect(result.claim?.subjectNodeId).toBe("book");
    expect(result.r).toBe(1);
  });
});
