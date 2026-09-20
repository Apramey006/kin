import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoDataset, resetFamily } from "../lib/seed";
import { findGaps, pickTopGap, routeQuestion, runWeaver, type WeaverData } from "../lib/weaver";
import { anchorOriginAnswer } from "../lib/ingestion/answer";
import { literalFacts } from "../lib/ingestion/facts";
import { prepareGraph } from "../lib/ingestion/persist";
import type { Extraction } from "../lib/extract";

const dataset = demoDataset("670f5075-c286-4b29-8074-86401c18d0c0");
const data: WeaverData = { ...dataset, facePersonIds: [],
  wearerNodeId: dataset.nodes.find((n) => n.relation_to_wearer === "self")!.id, openQuestionRelativeIds: [] };
const gap = pickTopGap(data)!;
const nora = dataset.nodes.find((n) => n.label === "Nora")!;

describe("stable demo and Weaver answer loop", () => {
  it("preserves shared memories and adds P0 human reenactments, two independent Nora sources, irrelevant evidence and no origin", () => {
    expect(dataset.memories).toHaveLength(24);
    expect(demoDataset("670f5075-c286-4b29-8074-86401c18d0c0")).toEqual(dataset);
    expect(demoDataset("other").ids).not.toEqual(dataset.ids);
    expect(dataset.memories.every((m) => m.source.type === "human" && m.source.reenacted)).toBe(true);
    expect(new Set(dataset.memories.filter((m) => m.verified_facts.some((f) => f.subjectNodeId === nora.id))
      .map((m) => m.contributor_id)).size).toBe(2);
    expect(dataset.memories.some((m) => !m.verified_facts.some((f) => f.subjectNodeId === nora.id))).toBe(true);
    expect(gap.type).toBe("missing_origin");
    expect(routeQuestion(data, gap)).toBe(dataset.ids.david);
    expect(dataset.edges.some((e) => e.rel === "origin")).toBe(false);
  });

  it("closes the selected tradition with literal David answer and links it for later Nora retrieval", () => {
    const extraction: Extraction = { summary: "Their mother's recipe came from Italy.", nodes: [], edges: [] };
    const transcript = "It was actually their mother's recipe. She brought it from Italy.";
    const subjects = anchorOriginAnswer(extraction, transcript, { gap_node_id: gap.nodeId, gap_type: gap.type }, dataset.nodes, dataset.edges);
    expect(subjects.map((s) => s.id)).toContain(nora.id);
    const graph = prepareGraph({ familyId: "670f5075-c286-4b29-8074-86401c18d0c0", contributorId: dataset.ids.david, userId: "demo-user", isAdmin: false, isSelf: false,
      contributor: dataset.relatives.find((r) => r.id === dataset.ids.david)! }, "answer-id", extraction, dataset.nodes, dataset.edges);
    expect(graph.edges).toContainEqual(expect.objectContaining({ from_node: gap.nodeId, rel: "origin" }));
    expect(graph.provenance).toContainEqual(expect.objectContaining({ memory_id: "answer-id", node_id: nora.id, contributor_id: dataset.ids.david }));
    expect(findGaps({ ...data, nodes: [...dataset.nodes, ...graph.nodes], edges: [...dataset.edges, ...graph.edges] }))
      .not.toContainEqual(gap);
  });

  it.each(["I don't remember.", "Maybe she brought it from Italy.", "She did not bring it from Italy.", "The question says it came from Italy."])("does not manufacture an origin from %s", (transcript) => {
    const extraction: Extraction = { summary: transcript, nodes: [], edges: [
      { from: `existing:${gap.nodeId}`, rel: "origin", to: "new:italy" },
    ] };
    expect(anchorOriginAnswer(extraction, transcript, { gap_node_id: gap.nodeId, gap_type: gap.type }, dataset.nodes, dataset.edges)).toEqual([]);
    expect(extraction.edges).toEqual([]);
  });

  it("keeps literal spans, rejects substring name matches and ignores unrelated facts", () => {
    const text = "😀 Nora likes tea. Honorary guests like coffee. Sam likes music.";
    const facts = literalFacts(text, [nora], "m", "c");
    expect(facts).toHaveLength(1);
    expect(facts[0].text).toBe("😀 Nora likes tea.");
    expect(text.slice(facts[0].sourceSpan!.start, facts[0].sourceSpan!.end)).toBe(facts[0].text);
  });
});

describe("Weaver persistence decisions", () => {
  function fakeDb(open: object[], failure = false) {
    const tables: Record<string, object[]> = { graph_nodes: dataset.nodes, graph_edges: dataset.edges,
      memories: dataset.memories, provenance: dataset.provenance, face_embeddings: [], relatives: dataset.relatives, weaver_questions: open };
    const insert = vi.fn();
    const sb = { from: (table: string) => {
      const filters: [string, unknown][] = [];
      let max = Infinity;
      const query = { select: () => query, eq: (k: string, v: unknown) => { filters.push([k, v]); return query; },
        limit: (v: number) => { max = v; return query; }, insert,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: (tables[table] ?? []).filter((row) =>
          filters.every(([k, v]) => (row as Record<string, unknown>)[k] === v)).slice(0, max),
          error: failure ? { code: "connection_failure" } : null }).then(resolve) };
      return query;
    } } as unknown as SupabaseClient;
    return { sb, insert };
  }
  it("returns existing open question before choosing a new target or inserting", async () => {
    const existing = { id: "q", family_id: "670f5075-c286-4b29-8074-86401c18d0c0", gap_node_id: gap.nodeId, gap_type: gap.type, status: "open",
      target_relative_id: dataset.ids.david, evidence: [{ memory_id: dataset.memories[0].id }] };
    const { sb, insert } = fakeDb([existing]);
    expect(await runWeaver(sb, "670f5075-c286-4b29-8074-86401c18d0c0")).toEqual({ question: existing, gap, reason: "existing_open" });
    expect(insert).not.toHaveBeenCalled();
  });
  it("surfaces database failure rather than claiming there are no gaps", async () => {
    await expect(runWeaver(fakeDb([], true).sb, "670f5075-c286-4b29-8074-86401c18d0c0")).rejects.toMatchObject({ code: "connection_failure" });
  });
});

describe("reset storage and membership", () => {
  it("walks nested uploads and preserves relatives so a signed-in admin can reseed", async () => {
    const list = vi.fn(async (prefix: string) => ({ error: null, data: prefix === "670f5075-c286-4b29-8074-86401c18d0c0" ? [{ name: "contributor", id: null }]
      : prefix === "670f5075-c286-4b29-8074-86401c18d0c0/contributor" ? [{ name: "memory", id: null }] : [{ name: "image", id: "file" }] }));
    const remove = vi.fn(async () => ({ error: null }));
    const tables: string[] = [];
    const sb = { storage: { from: () => ({ list, remove }) }, from: (table: string) => {
      tables.push(table); return { delete: () => ({ eq: async () => ({ error: null }) }) };
    } } as unknown as SupabaseClient;
    await resetFamily(sb, "670f5075-c286-4b29-8074-86401c18d0c0");
    expect(remove).toHaveBeenCalledWith(["670f5075-c286-4b29-8074-86401c18d0c0/contributor/memory/image"]);
    expect(tables).toContain("ingestion_receipts");
    expect(tables).not.toContain("relatives");
  });
  it("rejects a storage error before resetting database state", async () => {
    const from = vi.fn();
    const sb = { storage: { from: () => ({ list: async () => ({ error: { statusCode: "503" } }) }) }, from } as unknown as SupabaseClient;
    await expect(resetFamily(sb, "670f5075-c286-4b29-8074-86401c18d0c0")).rejects.toMatchObject({ statusCode: "503" });
    expect(from).not.toHaveBeenCalled();
  });
});
