import { describe, it, expect, vi } from "vitest";
import { buildKeeperResult, faceScore, simScore, retrieveKeeper, humanFacts } from "../lib/keepers";
import type { FaceOutcome, MemoryRow } from "../lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const face: FaceOutcome = { status: "matched", subjectNodeId: "nora", model: "canonical", enrollmentIds: ["e"], distance: .3, v: 1 };
const keeper = { relativeId: "maya", name: "Maya", color: "gold" };
function memory(id = "m1", contributor = "maya", subject = "nora", text = "Nora bakes lemon cake every Sunday."): MemoryRow & { similarity: number } {
  return { id, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", contributor_id: contributor, kind: "story", media_path: null, transcript: text, caption: null,
    summary: "generated summary", source_question_id: null, created_at: "2026-01-01", similarity: .6, source: { type: "human" },
    verified_facts: [{ id: id + "-fact", memoryId: id, contributorId: contributor, subjectNodeId: subject, text, sourceSpan: { start: 0, end: text.length } }] };
}
describe("human-scoped keepers", () => {
  it("maps distance and similarity conservatively", () => {
    expect(faceScore(.35)).toBe(1); expect(faceScore(.6)).toBe(0);
    // Calibration in bf0c5d9 uses a .10 floor and .30 window.
    expect(simScore(.1)).toBe(0); expect(simScore(.4)).toBeCloseTo(1);
  });
  it("excludes other contributors and other subjects, including their high scores", () => {
    const own = memory(); own.similarity = .3;
    const result = buildKeeperResult(keeper, { face, subjectLabel: "Nora", memories: [own, memory("foreign", "david"), memory("unrelated", "maya", "sam")] });
    expect(result.memoryIds).toEqual(["m1"]); expect(result.r).toBeCloseTo(2 / 3);
    expect(result.evidence[0].source).toBe("human");
  });
  it("cannot cite a vision caption or generated summary as a human fact", () => {
    const m = memory(); m.transcript = null; m.caption = m.verified_facts![0].text;
    expect(humanFacts(m, "nora")).toEqual([]);
    expect(buildKeeperResult(keeper, { face, subjectLabel: "Nora", memories: [m] }).support).toBe("abstains");
  });
  it("rejects altered spans, mismatched owners, and enrollment-only labels", () => {
    const m = memory(); m.verified_facts![0].sourceSpan!.start = 1;
    expect(humanFacts(m, "nora")).toEqual([]);
    expect(humanFacts(memory("m", "maya", "nora", "This is Nora in the kitchen."), "nora")).toEqual([]);
  });
  it("explicit human denial becomes a contradictory keeper", () => {
    expect(buildKeeperResult(keeper, { face, subjectLabel: "Nora", memories: [memory("m", "maya", "nora", "Nora never baked lemon cake on Sundays.")] }).support).toBe("contradicts");
  });
  it("unknown face cannot acquire a semantic fallback identity", () => {
    expect(buildKeeperResult(keeper, { face: { status: "unknown", model: "canonical" }, subjectLabel: "Nora", memories: [memory()] }).claim).toBeNull();
  });
  it("waits for semantic evidence beyond the old 700ms shortcut", async () => {
    vi.useFakeTimers();
    try {
      const builder = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { label: "Nora" }, error: null }) };
      const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
      const sb = { from: () => builder, rpc } as unknown as SupabaseClient;
      let resolve!: (value: number[]) => void;
      const embeddingPromise = new Promise<number[]>(r => { resolve = r; });
      let done = false;
      const pending = retrieveKeeper(sb, "670f5075-c286-4b29-8074-86401c18d0c0", keeper, { face, embeddingPromise }).then(r => { done = true; return r; });
      await vi.advanceTimersByTimeAsync(1200);
      expect(done).toBe(false); expect(rpc).not.toHaveBeenCalled();
      resolve(new Array(1536).fill(.01)); await pending;
      expect(rpc).toHaveBeenCalledWith("match_subject_memories", expect.objectContaining({ family: "670f5075-c286-4b29-8074-86401c18d0c0", contributor: "maya", subject: "nora" }));
    } finally { vi.useRealTimers(); }
  });
  it("database error propagates instead of masquerading as abstention", async () => {
    const builder = { select: () => builder, eq: () => builder, single: async () => ({ data: null, error: { code: "failure" } }) };
    const sb = { from: () => builder, rpc: async () => ({ data: null, error: {} }) } as unknown as SupabaseClient;
    await expect(retrieveKeeper(sb, "670f5075-c286-4b29-8074-86401c18d0c0", keeper, { face, embeddingPromise: Promise.resolve(new Array(1536).fill(.1)) })).rejects.toThrow();
  });
});
