import { describe, it, expect } from "vitest";
import { routeQuestion, findGaps, pickTopGap, type WeaverData } from "../lib/weaver";
import { evaluateGate } from "../lib/gate";
import { renderFacts, validateGrounding } from "../lib/synthesize";
import type { FaceOutcome, GraphEdgeRow, GraphNodeRow, KeeperResult, ProvenanceRow, Relative, VerifiedFact } from "../lib/types";

const FAMILY = "670f5075-c286-4b29-8074-86401c18d0c0";

const relatives: Relative[] = [
  { id: "rosa", family_id: FAMILY, name: "Rosa", relation_to_wearer: "self", color: "#8a7fd1", is_self: true },
  { id: "maya", family_id: FAMILY, name: "Maya", relation_to_wearer: "granddaughter", color: "#E0A458" },
  { id: "david", family_id: FAMILY, name: "David", relation_to_wearer: "son", color: "#5B8DEF" },
];

const node = (id: string, type: GraphNodeRow["type"], label: string, rel: string | null = null): GraphNodeRow => ({
  id, family_id: FAMILY, type, label, aliases: [], relation_to_wearer: rel,
});
const edge = (id: string, from: string, rel: string, to: string): GraphEdgeRow => ({
  id, family_id: FAMILY, from_node: from, rel, to_node: to,
});
const prov = (memory: string, contributor: string, nodeId: string): ProvenanceRow => ({
  id: memory + nodeId, memory_id: memory, contributor_id: contributor, node_id: nodeId, edge_id: null,
});

// A tradition two people join with no recorded origin: a missing_origin gap.
const context: WeaverData = {
  nodes: [node("rosa-n", "person", "Rosa", "self"), node("nora", "person", "Nora", "sister"),
    node("cake", "tradition", "Sunday lemon cake baking")],
  edges: [edge("e1", "rosa-n", "participates_in", "cake"), edge("e2", "nora", "participates_in", "cake")],
  provenance: [prov("m-rosa", "rosa", "cake"), prov("m-maya", "maya", "cake")],
  memories: [
    { id: "m-rosa", contributor_id: "rosa", kind: "story", summary: "Rosa recalls the Sunday cake." },
    { id: "m-maya", contributor_id: "maya", kind: "story", summary: "Maya recalls the Sunday cake." },
  ],
  facePersonIds: [], wearerNodeId: "rosa-n", relatives, openQuestionRelativeIds: [],
};

describe("the wearer as a contributor", () => {
  it("finds the gap it is meant to route", () => {
    expect(pickTopGap(context)?.type).toBe("missing_origin");
    expect(findGaps(context).length).toBeGreaterThan(0);
  });

  it("never routes a Weaver question to the wearer", () => {
    const gap = pickTopGap(context)!;
    expect(routeQuestion(context, gap)).not.toBe("rosa");
  });

  it("still asks nobody rather than asking the wearer when they are the only candidate", () => {
    const gap = pickTopGap(context)!;
    const onlySelf: WeaverData = { ...context, relatives: [relatives[0]] };
    expect(routeQuestion(onlySelf, gap)).toBeNull();
  });

  it("does not route to the wearer even when every contributor already described the gap", () => {
    const gap = pickTopGap(context)!;
    const allDescribed: WeaverData = {
      ...context,
      memories: relatives.map(r => ({ id: "m-" + r.id, contributor_id: r.id, kind: "story" as const, summary: "described" })),
      provenance: relatives.map(r => prov("m-" + r.id, r.id, "cake")),
    };
    expect(routeQuestion(allDescribed, gap)).not.toBe("rosa");
  });
});

const face: FaceOutcome = { status: "matched", subjectNodeId: "nora", model: "canonical", enrollmentIds: ["e"], distance: .3, v: 1 };
const keeper = (id: string, r = 1): KeeperResult => ({
  keeperId: id, claim: { subjectNodeId: "nora", label: "Nora" },
  memoryIds: [id + "-story"], v: 1, r, support: "supports", reason: "human story",
  evidence: [{ memoryId: id + "-story", contributorId: id, subjectNodeId: "nora", source: "human", supportedFacts: ["Nora and I baked every Sunday."] }],
});

describe("self memories under the existing gate", () => {
  // This is why no gate change was needed: the two-contributor rule already
  // prevents a confabulated self memory from ever being spoken on its own.
  it("a self memory alone can never speak", () => {
    expect(evaluateGate([keeper("rosa")], { face }).reasonCode).toBe("insufficient_evidence");
  });

  it("a self memory corroborated by one relative can speak", () => {
    const g = evaluateGate([keeper("rosa", .9), keeper("maya", .9)], { face });
    expect(g.decision).toBe("speak");
    expect(g.agreeingKeeperIds).toContain("rosa");
  });

  it("a self memory contradicting a relative still silences recall", () => {
    const dissent = { ...keeper("maya"), support: "contradicts" as const };
    expect(evaluateGate([keeper("rosa"), dissent], { face }).reasonCode).toBe("contradiction");
  });
});

describe("cue attribution", () => {
  const fact = (id: string, contributorId: string, speaker?: string): VerifiedFact => ({
    id, subjectNodeId: "nora", memoryId: id + "-m", contributorId,
    text: "Nora and I baked lemon cake every Sunday.", ...(speaker ? { speaker } : {}),
  });

  it("attributes the wearer's own words to them", () => {
    expect(renderFacts([fact("f1", "rosa", "You")]))
      .toBe("You said: “Nora and I baked lemon cake every Sunday.”");
  });

  it("keeps the existing wording for family contributors", () => {
    expect(renderFacts([fact("f2", "maya")]))
      .toBe("A relative said: “Nora and I baked lemon cake every Sunday.”");
  });

  it("validates a mixed-speaker cue only against its own rendering", () => {
    const facts = [fact("f1", "rosa", "You"), fact("f2", "maya")];
    expect(validateGrounding({ factIds: ["f1", "f2"], cue: renderFacts(facts) }, facts)).toBe(true);
    // Swapping the attribution is a paraphrase and must fail closed.
    expect(validateGrounding({ factIds: ["f1"], cue: renderFacts([fact("f1", "rosa")]) }, facts)).toBe(false);
  });
});
