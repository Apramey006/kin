import { describe, it, expect } from "vitest";
import { findGaps, pickTopGap, routeQuestion, type WeaverData } from "../lib/weaver";
import type { GraphEdgeRow, GraphNodeRow, ProvenanceRow, Relative } from "../lib/types";

// Mirror of scripts/seed.ts graph, expressed as plain data.
const relatives: Relative[] = [
  { id: "maya", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", name: "Maya", relation_to_wearer: "granddaughter", color: "#E0A458" },
  { id: "david", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", name: "David", relation_to_wearer: "son", color: "#5B8DEF" },
  { id: "elena", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", name: "Elena", relation_to_wearer: "daughter", color: "#B07CC6" },
];

const node = (id: string, type: GraphNodeRow["type"], label: string, rel: string | null = null): GraphNodeRow => ({
  id, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", type, label, aliases: [], relation_to_wearer: rel,
});

const nodes = [
  node("rosa", "person", "Rosa", "self"),
  node("nora", "person", "Nora", "sister"),
  node("cake", "tradition", "Sunday lemon cake baking"),
  node("apron", "object", "yellow apron"),
  node("book", "object", "Nana's recipe book"),
];

const edge = (id: string, from: string, rel: string, to: string): GraphEdgeRow => ({
  id, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", from_node: from, rel, to_node: to,
});

const edges = [
  edge("e1", "rosa", "participates_in", "cake"),
  edge("e2", "nora", "participates_in", "cake"),
  edge("e3", "nora", "sibling_of", "rosa"),
  edge("e4", "nora", "wears", "apron"),
  edge("e5", "rosa", "taught_by", "nora"),
  edge("e6", "rosa", "owns", "book"),
];

const memories = [
  { id: "m-maya", contributor_id: "maya", kind: "story" as const, summary: "Maya shared a story about Nora and lemon cake." },
  { id: "m-elena", contributor_id: "elena", kind: "story" as const, summary: "Elena shared a story about Nora teaching Rosa." },
  { id: "m-david", contributor_id: "david", kind: "photo" as const, summary: "David shared a photo of the recipe book." },
];

const prov = (
  id: string,
  memory: string,
  contributor: string,
  node_id?: string,
  edge_id?: string
): ProvenanceRow => ({
  id, memory_id: memory, contributor_id: contributor, node_id: node_id ?? null, edge_id: edge_id ?? null,
});

const provenance = [
  prov("p1", "m-maya", "maya", "rosa"),
  prov("p2", "m-maya", "maya", "nora"),
  prov("p3", "m-maya", "maya", "cake"),
  prov("p4", "m-maya", "maya", "apron"),
  prov("p5", "m-maya", "maya", undefined, "e1"),
  prov("p6", "m-maya", "maya", undefined, "e2"),
  prov("p7", "m-maya", "maya", undefined, "e3"),
  prov("p8", "m-maya", "maya", undefined, "e4"),
  prov("p9", "m-elena", "elena", "nora"),
  prov("p10", "m-elena", "elena", "rosa"),
  prov("p11", "m-elena", "elena", undefined, "e5"),
  prov("p12", "m-david", "david", "book"),
  prov("p13", "m-david", "david", "rosa"),
  prov("p14", "m-david", "david", undefined, "e6"),
];

const seeded: WeaverData = {
  nodes,
  edges,
  provenance,
  memories,
  facePersonIds: [],
  wearerNodeId: "rosa",
  relatives,
  openQuestionRelativeIds: [],
};

describe("weaver on the seeded graph", () => {
  it("finds missing_origin on lemon cake as the top gap", () => {
    const gaps = findGaps(seeded);
    expect(gaps).toContainEqual({ type: "missing_origin", nodeId: "cake" });
    const top = pickTopGap(seeded);
    expect(top).toEqual({ type: "missing_origin", nodeId: "cake" });
  });

  it("routes the question to David", () => {
    const gap = pickTopGap(seeded)!;
    expect(routeQuestion(seeded, gap)).toBe("david");
  });

  it("once the origin edge exists, the gap is gone", () => {
    const answered: WeaverData = {
      ...seeded,
      edges: [...edges, edge("e7", "cake", "origin", "italy")],
      nodes: [...nodes, node("italy", "place", "Italy")],
    };
    const gaps = findGaps(answered);
    expect(gaps.find((g) => g.nodeId === "cake" && g.type === "missing_origin")).toBeUndefined();
  });

  it("detects an unrelated person with an enrolled face", () => {
    const withFace: WeaverData = {
      ...seeded,
      nodes: [...nodes, node("sam", "person", "Sam")],
      facePersonIds: ["sam"],
    };
    expect(findGaps(withFace)).toContainEqual({ type: "unrelated_person", nodeId: "sam" });
  });
});
