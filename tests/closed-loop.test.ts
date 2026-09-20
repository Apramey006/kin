import { describe, expect, it } from "vitest";
import { demoDataset } from "../lib/seed";
import { findGaps, pickTopGap, routeQuestion, type WeaverData } from "../lib/weaver";
import { anchorOriginAnswer } from "../lib/ingestion/answer";
import { prepareGraph } from "../lib/ingestion/persist";
import { buildKeeperResult, humanFacts } from "../lib/keepers";
import { evaluateGate } from "../lib/gate";
import { renderFacts, synthesizeCue } from "../lib/synthesize";
import type { Extraction } from "../lib/extract";
import type { FaceOutcome, MemoryRow, VerifiedFact } from "../lib/types";

describe("P0 engine closed loop with explicitly mocked recognition and semantic scores", () => {
  it("independent Nora stories → cue → David gap answer → closed origin → new cited cue", async () => {
    const seed = demoDataset("670f5075-c286-4b29-8074-86401c18d0c0");
    const nora = seed.nodes.find(n => n.label === "Nora")!;
    const context: WeaverData = { ...seed, facePersonIds: [nora.id], wearerNodeId: seed.nodes.find(n => n.label === "Rosa")!.id, openQuestionRelativeIds: [] };
    const face: FaceOutcome = { status: "matched", model: "mock-only", subjectNodeId: nora.id, enrollmentIds: ["mock-enrollment"], distance: .3, v: 1 };
    const rows: MemoryRow[] = seed.memories.map(m => ({ ...m, created_at: "2026-01-01" }));
    const keepers = (memories: MemoryRow[]) => seed.relatives.map(relative => buildKeeperResult(
      { relativeId: relative.id, name: relative.name, color: relative.color },
      { face, subjectLabel: nora.label, memories: memories.map(m => ({ ...m, similarity: .6 })) },
    ));
    const before = evaluateGate(keepers(rows), { face });
    expect(before.decision).toBe("speak");
    expect(before.agreeingKeeperIds).toHaveLength(2);
    const first = await synthesizeCue({ facts: rows.flatMap(m => humanFacts(m, nora.id)), rewrite: async facts => ({ factIds: [facts[0].id], cue: renderFacts([facts[0]]) }) });
    expect(first.grounded).toBe(true);
    expect(first.text).not.toContain("Italy");
    const gap = pickTopGap(context)!;
    expect(gap.type).toBe("missing_origin");
    expect(routeQuestion(context, gap)).toBe(seed.ids.david);
    const transcript = "It was actually their mother's recipe. She brought it from Italy.";
    const extraction: Extraction = { summary: "Their mother's recipe came from Italy.", nodes: [], edges: [] };
    const subjects = anchorOriginAnswer(extraction, transcript, { gap_type: gap.type, gap_node_id: gap.nodeId }, seed.nodes, seed.edges);
    const graph = prepareGraph({ familyId: "670f5075-c286-4b29-8074-86401c18d0c0", contributorId: seed.ids.david, userId: "mock-user", isAdmin: false, isSelf: false,
      contributor: seed.relatives.find(r => r.id === seed.ids.david)! }, "answer-memory", extraction, seed.nodes, seed.edges);
    expect(findGaps({ ...context, nodes: [...seed.nodes, ...graph.nodes], edges: [...seed.edges, ...graph.edges] })).not.toContainEqual(gap);
    const facts: VerifiedFact[] = subjects.map(subject => ({ id: "answer-fact-" + subject.id, subjectNodeId: subject.id, memoryId: "answer-memory",
      contributorId: seed.ids.david, text: transcript, sourceSpan: { start: 0, end: transcript.length } }));
    const answer: MemoryRow = { id: "answer-memory", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", contributor_id: seed.ids.david, kind: "answer",
      media_path: null, transcript, caption: null, summary: extraction.summary, source_question_id: "mock-question",
      created_at: "2026-01-02", source: { type: "human" }, verified_facts: facts };
    const after = evaluateGate(keepers([...rows, answer]), { face });
    expect(after.decision).toBe("speak");
    expect(after.citedMemoryIds).toContain(answer.id);
    const updated = await synthesizeCue({ facts: humanFacts(answer, nora.id), rewrite: async selected => ({ factIds: [selected[0].id], cue: renderFacts([selected[0]]) }) });
    expect(updated.grounded).toBe(true);
    expect(updated.text).toContain("Italy");
    expect(updated.factIds).toContain("answer-fact-" + nora.id);
  });
});
