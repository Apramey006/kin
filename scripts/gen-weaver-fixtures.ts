/**
 * Freezes the pure Weaver functions (findGaps / pickTopGap / routeQuestion)
 * into language-neutral JSON, over the seeded family graph and variants that
 * exercise each gap type and each routing branch.
 */
import { writeFileSync } from "node:fs";
import { demoDataset } from "../lib/seed";
import { DEMO_FAMILY_ID } from "../lib/demo";
import { findGaps, pickTopGap, routeQuestion, type WeaverData } from "../lib/weaver";
import type { GraphEdgeRow, GraphNodeRow, ProvenanceRow, Relative } from "../lib/types";

const relatives: Relative[] = [
  { id: "maya", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", name: "Maya", relation_to_wearer: "granddaughter", color: "#E0A458" },
  { id: "david", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", name: "David", relation_to_wearer: "son", color: "#5B8DEF" },
  { id: "elena", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", name: "Elena", relation_to_wearer: "daughter", color: "#B07CC6" },
];
const node = (id: string, type: GraphNodeRow["type"], label: string, rel: string | null = null): GraphNodeRow =>
  ({ id, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", type, label, aliases: [], relation_to_wearer: rel });
const edge = (id: string, from: string, rel: string, to: string): GraphEdgeRow =>
  ({ id, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", from_node: from, rel, to_node: to });
const prov = (id: string, memory: string, contributor: string, node_id?: string, edge_id?: string): ProvenanceRow =>
  ({ id, memory_id: memory, contributor_id: contributor, node_id: node_id ?? null, edge_id: edge_id ?? null });

const nodes = [
  node("rosa", "person", "Rosa", "self"),
  node("nora", "person", "Nora", "sister"),
  node("cake", "tradition", "Sunday lemon cake baking"),
  node("apron", "object", "yellow apron"),
  node("book", "object", "Nana's recipe book"),
];
const edges = [
  edge("e1", "rosa", "participates_in", "cake"),
  edge("e2", "nora", "participates_in", "cake"),
  edge("e3", "nora", "sibling_of", "rosa"),
  edge("e4", "nora", "wears", "apron"),
  edge("e5", "rosa", "taught_by", "nora"),
  edge("e6", "rosa", "owns", "book"),
];
const memories = [
  { id: "m-maya", contributor_id: "maya", kind: "story" as const, summary: "Maya on Nora and lemon cake." },
  { id: "m-elena", contributor_id: "elena", kind: "story" as const, summary: "Elena on Nora teaching Rosa." },
  { id: "m-david", contributor_id: "david", kind: "photo" as const, summary: "David's photo of the recipe book." },
];
const provenance = [
  prov("p1", "m-maya", "maya", "rosa"), prov("p2", "m-maya", "maya", "nora"),
  prov("p3", "m-maya", "maya", "cake"), prov("p4", "m-maya", "maya", "apron"),
  prov("p5", "m-maya", "maya", undefined, "e1"), prov("p6", "m-maya", "maya", undefined, "e2"),
  prov("p7", "m-maya", "maya", undefined, "e3"), prov("p8", "m-maya", "maya", undefined, "e4"),
  prov("p9", "m-elena", "elena", "nora"), prov("p10", "m-elena", "elena", "rosa"),
  prov("p11", "m-elena", "elena", undefined, "e5"),
  prov("p12", "m-david", "david", "book"), prov("p13", "m-david", "david", "rosa"),
  prov("p14", "m-david", "david", undefined, "e6"),
];

const seeded: WeaverData = {
  nodes, edges, provenance, memories,
  facePersonIds: [], wearerNodeId: "rosa", relatives, openQuestionRelativeIds: [],
};

const cases: { name: string; data: WeaverData }[] = [
  { name: "seeded-graph", data: seeded },
  {
    name: "origin-answered",
    data: { ...seeded,
      nodes: [...nodes, node("italy", "place", "Italy")],
      edges: [...edges, edge("e7", "cake", "origin", "italy")] },
  },
  {
    name: "unrelated-person-with-enrolled-face",
    data: { ...seeded,
      nodes: [...nodes, node("sam", "person", "Sam")],
      facePersonIds: ["sam"] },
  },
  {
    name: "person-with-face-but-related-to-wearer",
    data: { ...seeded,
      nodes: [...nodes, node("sam", "person", "Sam")],
      edges: [...edges, edge("e8", "sam", "sibling_of", "rosa")],
      facePersonIds: ["sam"] },
  },
  {
    name: "orphan-object-single-memory",
    data: { ...seeded,
      nodes: [...nodes, node("watch", "object", "gold watch")],
      provenance: [...provenance, prov("p15", "m-david", "david", "watch")] },
  },
  {
    name: "object-linked-to-tradition-is-not-orphan",
    data: { ...seeded,
      nodes: [...nodes, node("watch", "object", "gold watch")],
      edges: [...edges, edge("e9", "watch", "used_in", "cake")],
      provenance: [...provenance, prov("p15", "m-david", "david", "watch")] },
  },
  {
    name: "routing-skips-relative-with-open-question",
    data: { ...seeded, openQuestionRelativeIds: ["david"] },
  },
  {
    name: "routing-falls-back-when-all-describers",
    data: { ...seeded, openQuestionRelativeIds: ["maya", "elena"] },
  },
  {
    name: "routing-returns-null-when-everyone-has-open-question",
    data: { ...seeded, openQuestionRelativeIds: ["maya", "david", "elena"] },
  },
  { name: "empty-graph",
    data: { nodes: [], edges: [], provenance: [], memories: [],
      facePersonIds: [], wearerNodeId: null, relatives, openQuestionRelativeIds: [] } },
];

cases.push({ name: "equal-scores-use-stable-ids", data: {
  ...seeded, nodes: [node("b", "object", "Book"), node("a", "object", "Apron")], edges: [],
  provenance: [prov("tie1", "m-maya", "maya", "b"), prov("tie2", "m-maya", "maya", "a")],
  relatives: [...relatives].reverse(),
} });

const shared = demoDataset(DEMO_FAMILY_ID);
cases.push({ name: "canonical-shared-family-keeps-david-answer-loop", data: {
  ...shared, facePersonIds: [], openQuestionRelativeIds: [],
  wearerNodeId: shared.nodes.find(n => n.relation_to_wearer === "self")!.id,
} });
const fixtures = cases.map((c) => {
  const top = pickTopGap(c.data);
  return {
    name: c.name,
    input: c.data,
    expected: {
      gaps: findGaps(c.data),
      topGap: top,
      routedTo: top ? routeQuestion(c.data, top) : null,
    },
  };
});

writeFileSync("conformance/weaver-fixtures.json", JSON.stringify({ cases: fixtures }, null, 2) + "\n");
for (const f of fixtures) {
  console.log(
    `${f.name}: ${f.expected.gaps.length} gaps, top=${f.expected.topGap?.type ?? "none"}, route=${f.expected.routedTo ?? "none"}`
  );
}
