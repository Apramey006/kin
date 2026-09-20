import type { SupabaseClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";
import { clamp } from "./util";
import type { FaceOutcome, Keeper, KeeperResult, MemoryRow, VerifiedFact } from "./types";

export const faceScore = (distance: number) => clamp((CONFIG.face.vZeroDistance - distance) / CONFIG.face.vWindow, 0, 1);
export const simScore = (similarity: number) => clamp((similarity - CONFIG.retrieval.simFloor) / CONFIG.retrieval.simWindow, 0, 1);
export interface KeeperContext { face: FaceOutcome; embeddingPromise: Promise<number[]> }
export interface KeeperInput {
  face: FaceOutcome;
  subjectLabel: string;
  memories: (MemoryRow & { similarity: number })[];
}

/** A fact is eligible only when its exact text is a span in the human source.
 * Neither the vision caption nor an extraction summary can establish a fact. */
export function humanFacts(memory: MemoryRow, subjectId: string): VerifiedFact[] {
  if (memory.source?.type !== "human") return [];
  const literal = memory.transcript || memory.source.caption || "";
  return (memory.verified_facts ?? []).filter(f =>
    f.subjectNodeId === subjectId && f.memoryId === memory.id &&
    f.contributorId === memory.contributor_id && f.text.trim().split(/\s+/).length >= 4 &&
    !/^(?:(?:this|that|here)\s+(?:is|was)|(?:a\s+)?(?:photo|picture)\s+of)\b/i.test(f.text.trim()) &&
    literal.includes(f.text) && (!f.sourceSpan ||
      literal.slice(f.sourceSpan.start, f.sourceSpan.end) === f.text));
}

export function buildKeeperResult(keeper: Keeper, input: KeeperInput): KeeperResult {
  const base: KeeperResult = {
    keeperId: keeper.relativeId, claim: null, memoryIds: [], v: 0, r: 0,
    reason: "No meaningful human story linked to this subject", support: "abstains", evidence: [],
  };
  if (input.face.status !== "matched") return base;
  const subjectId = input.face.subjectNodeId;
  const own = input.memories.filter(m => m.contributor_id === keeper.relativeId &&
    Number.isFinite(m.similarity) && humanFacts(m, subjectId).length)
    .sort((a, b) => b.similarity - a.similarity).slice(0, CONFIG.retrieval.maxSubjectMemories);
  if (!own.length) return base;
  const disputed = own.some(m => humanFacts(m, subjectId).some(f =>
    /\b(?:never|incorrect|mistaken|did not|didn't|was not|wasn't|not true|not actually)\b/i.test(f.text)));
  return {
    ...base, claim: { subjectNodeId: subjectId, label: input.subjectLabel },
    memoryIds: own.map(m => m.id), v: input.face.v, r: simScore(own[0].similarity),
    support: disputed ? "contradicts" : "supports",
    reason: disputed ? "Human evidence contains an explicit denial; review before recall" : "Contributor's human story supports the matched subject",
    evidence: own.map(m => ({ memoryId: m.id, contributorId: m.contributor_id,
      subjectNodeId: subjectId, source: "human", supportedFacts: humanFacts(m, subjectId).map(f => f.text) })),
  };
}

export async function retrieveKeeper(sb: SupabaseClient, familyId: string, keeper: Keeper, ctx: KeeperContext): Promise<KeeperResult> {
  if (ctx.face.status !== "matched") return buildKeeperResult(keeper, { face: ctx.face, subjectLabel: "", memories: [] });
  const subjectId = ctx.face.subjectNodeId;
  // Full semantic evidence is required even for a strong face; no timing shortcut.
  const embedding = await ctx.embeddingPromise;
  if (embedding.length !== 1536 || embedding.some(n => !Number.isFinite(n)) || !embedding.some(n => n !== 0)) {
    throw new Error("Invalid semantic embedding");
  }
  const [matched, subject] = await Promise.all([
    sb.rpc("match_subject_memories", { query: JSON.stringify(embedding), family: familyId,
      contributor: keeper.relativeId, subject: subjectId, k: CONFIG.retrieval.topK }),
    sb.from("graph_nodes").select("label").eq("id", subjectId).eq("family_id", familyId).eq("type", "person").single(),
  ]);
  if (matched.error || subject.error || !subject.data) throw new Error("Keeper retrieval failed");
  const similarities = new Map<string, number>((matched.data ?? []).map((m: { id: string; similarity: number }) => [m.id, m.similarity]));
  console.log("KEEPER RETRIEVAL", {
    keeper: keeper.name,
    subject: subject.data?.label,
    matches: matched.data,
  });
  if (!similarities.size) return buildKeeperResult(keeper, { face: ctx.face, subjectLabel: subject.data.label, memories: [] });
  const memories = await sb.from("memories").select("*").eq("family_id", familyId)
    .eq("contributor_id", keeper.relativeId).in("id", [...similarities.keys()]);
  if (memories.error) throw new Error("Keeper memory read failed");
  return buildKeeperResult(keeper, { face: ctx.face, subjectLabel: subject.data.label,
    memories: (memories.data ?? []).map(m => ({ ...m, similarity: similarities.get(m.id) ?? 0 })) });
}

export async function runKeepers(sb: SupabaseClient, familyId: string, keepers: Keeper[], ctx: KeeperContext): Promise<KeeperResult[]> {
  // A database/provider error is not an abstention; caller must fail closed.
  return Promise.all(keepers.map(k => retrieveKeeper(sb, familyId, k, ctx)));
}
