import type { MemoryGraphData } from "./memory-graph";
import type { GraphNodeRow, NodeType } from "./types";

import { DEMO_FAMILY_ID, DEMO_CONTRIBUTOR_IDS } from "./demo";

const familyId = DEMO_FAMILY_ID;
const node = (id: string, type: NodeType, label: string, relation: string | null = null): GraphNodeRow => ({
  id, family_id: familyId, type, label, aliases: [], relation_to_wearer: relation,
});

export const DEMO_MEMORY_GRAPH: MemoryGraphData = {
  relatives: [
    { id: DEMO_CONTRIBUTOR_IDS.maya, family_id: familyId, name: "Maya", relation_to_wearer: "granddaughter", color: "#eac38a" },
    { id: DEMO_CONTRIBUTOR_IDS.elena, family_id: familyId, name: "Elena", relation_to_wearer: "daughter", color: "#b7a4e6" },
    { id: DEMO_CONTRIBUTOR_IDS.david, family_id: familyId, name: "David", relation_to_wearer: "son", color: "#8abdd4" },
  ],
  nodes: [
    node("rosa", "person", "Rosa", "self"), node("nora", "person", "Nora", "sister"),
    node("cake", "tradition", "Sunday lemon cake"), node("apron", "object", "The yellow apron"),
    node("book", "object", "Nana’s recipe book"), node("kitchen", "place", "Rosa’s kitchen"),
    node("mother", "person", "Lucia", "mother"), node("italy", "place", "Italy"),
    node("summer", "event", "Summer of 1968"),
  ],
  edges: [
    ["rosa-cake", "rosa", "participates_in", "cake"],
    ["nora-cake", "nora", "participates_in", "cake"],
    ["nora-apron", "nora", "wears", "apron"],
    ["nora-rosa", "nora", "sibling_of", "rosa"],
    ["rosa-nora", "rosa", "taught_by", "nora"],
    ["rosa-book", "rosa", "owns", "book"],
    ["cake-kitchen", "cake", "located_at", "kitchen"],
    ["nora-mother", "nora", "taught_by", "mother"],
    ["cake-italy", "cake", "origin", "italy"],
    ["rosa-summer", "rosa", "participates_in", "summer"],
    ["summer-italy", "summer", "located_at", "italy"],
  ].map(([id, from_node, rel, to_node]) => ({ id, family_id: familyId, from_node, rel, to_node })),
  memories: [
    { id: "first", contributor_id: "maya", kind: "story" as const, summary: "Rosa and Nora baked lemon cake every Sunday. Nora always wore her yellow apron.", transcript: "Grandma and Aunt Nora used to bake lemon cake every Sunday. Nora always wore that ridiculous yellow apron.", caption: null },
    { id: "second", contributor_id: "elena", kind: "story" as const, summary: "Nora taught her sister Rosa to cook when they were young.", transcript: "Nora taught Mom how to cook when they were girls. They were sisters, and the kitchen was their favorite place to be together.", caption: null },
    { id: "third", contributor_id: "david", kind: "photo" as const, summary: "Rosa kept Nana’s recipe book in her kitchen, where they baked the Sunday cake.", transcript: null, caption: "Nana’s recipe book, kept in Rosa’s kitchen." },
    { id: "fourth", contributor_id: "david", kind: "answer" as const, summary: "Their mother Lucia taught Nora the recipe. It came from Italy.", transcript: "It was their mother, Lucia. She brought the recipe from Italy, and taught it to Nora.", caption: null },
    { id: "fifth", contributor_id: "maya", kind: "story" as const, summary: "Rosa spent the summer of 1968 in Italy. She remembered it for the rest of her life.", transcript: "Grandma spent the summer of 1968 in Italy. She always said she could still remember how the lemons smelled.", caption: null },
  ].map((memory, index) => ({ ...memory, contributor_id: DEMO_CONTRIBUTOR_IDS[memory.contributor_id as keyof typeof DEMO_CONTRIBUTOR_IDS], family_id: familyId, media_path: null, source_question_id: null, created_at: `2026-09-${String(10 + index).padStart(2, "0")}T12:00:00Z` })),
  provenance: [
    { memory: "first", owner: "maya", nodes: ["rosa", "nora", "cake", "apron"], edges: ["rosa-cake", "nora-cake", "nora-apron"] },
    { memory: "second", owner: "elena", nodes: ["rosa", "nora"], edges: ["nora-rosa", "rosa-nora"] },
    { memory: "third", owner: "david", nodes: ["rosa", "book", "kitchen", "cake"], edges: ["rosa-book", "cake-kitchen"] },
    { memory: "fourth", owner: "david", nodes: ["nora", "mother", "cake", "italy"], edges: ["nora-mother", "cake-italy"] },
    { memory: "fifth", owner: "maya", nodes: ["rosa", "summer", "italy"], edges: ["rosa-summer", "summer-italy"] },
  ].flatMap((source) => [
    ...source.nodes.map((nodeId) => ({ id: `${source.memory}-${nodeId}`, memory_id: source.memory, contributor_id: DEMO_CONTRIBUTOR_IDS[source.owner as keyof typeof DEMO_CONTRIBUTOR_IDS], node_id: nodeId, edge_id: null })),
    ...source.edges.map((edgeId) => ({ id: `${source.memory}-${edgeId}`, memory_id: source.memory, contributor_id: DEMO_CONTRIBUTOR_IDS[source.owner as keyof typeof DEMO_CONTRIBUTOR_IDS], node_id: null, edge_id: edgeId })),
  ]),
};
