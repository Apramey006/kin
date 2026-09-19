import type { SupabaseClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";
import { clamp } from "./util";
import type { Keeper, KeeperResult } from "./types";

export const faceScore = (distance: number): number =>
  clamp((CONFIG.face.vZeroDistance - distance) / CONFIG.face.vWindow, 0, 1);

export const simScore = (similarity: number): number =>
  clamp(
    (similarity - CONFIG.retrieval.simFloor) / CONFIG.retrieval.simWindow,
    0,
    1
  );

const STRONG_FACE_V = 0.9;
const FAST_PATH_MEMORY_WAIT_MS = 700;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface FaceMatch {
  person_node_id: string;
  contributor_id: string;
  memory_id: string;
  distance: number;
}

export interface ScoredMemory {
  id: string;
  summary: string;
  similarity: number;
}

/**
 * Everything the pure keeper logic needs. The DB layer in this file assembles
 * this shape; tests can construct it directly.
 */
export interface KeeperInput {
  /** face match candidates (may include other relatives' rows; filtered here) */
  faceMatches: FaceMatch[];
  /** nodeId -> label */
  nodeLabels: Record<string, string>;
  /** nodeId -> type */
  nodeTypes: Record<string, string>;
  /** memoryId -> contributor_id, used to guarantee keepers only cite their own */
  memoryOwners: Record<string, string>;
  /** this keeper's top semantic matches, sorted by similarity desc */
  memories: ScoredMemory[];
  /** memoryId -> node ids the memory provides provenance for */
  memoryNodeLinks: Record<string, string[]>;
  /** this keeper's memory ids linked to the best face person */
  personLinkedMemories: ScoredMemory[];
}

export function buildKeeperResult(
  keeper: Keeper,
  input: KeeperInput
): KeeperResult {
  const own = (id: string) => input.memoryOwners[id] === keeper.relativeId;

  // Face step: best (lowest) distance among this keeper's own enrollments.
  let bestFace: FaceMatch | null = null;
  for (const m of input.faceMatches) {
    if (m.contributor_id !== keeper.relativeId) continue;
    if (!bestFace || m.distance < bestFace.distance) bestFace = m;
  }
  const v = bestFace ? faceScore(bestFace.distance) : 0;

  // Memory step: semantic match over this keeper's own memories.
  const ownMemories = input.memories
    .filter((m) => own(m.id))
    .sort((a, b) => b.similarity - a.similarity);
  const r = ownMemories.length ? simScore(ownMemories[0].similarity) : 0;

  // Claim.
  let claim: KeeperResult["claim"] = null;
  let reason: string;
  if (bestFace && v > 0) {
    claim = {
      subjectNodeId: bestFace.person_node_id,
      label: input.nodeLabels[bestFace.person_node_id] ?? "someone",
    };
    reason = `face match (d=${bestFace.distance.toFixed(2)})`;
  } else if (r >= CONFIG.retrieval.claimMinR && ownMemories.length) {
    const linked = (input.memoryNodeLinks[ownMemories[0].id] ?? []).find(
      (nid) =>
        input.nodeTypes[nid] === "person" || input.nodeTypes[nid] === "object"
    );
    if (linked) {
      claim = {
        subjectNodeId: linked,
        label: input.nodeLabels[linked] ?? "something",
      };
      reason = `memory match (sim=${ownMemories[0].similarity.toFixed(2)})`;
    } else {
      reason = "memory match but no linked subject";
    }
  } else {
    reason = bestFace
      ? `weak face match (d=${bestFace.distance.toFixed(2)})`
      : "no reliable memory";
  }

  // Cited memories: the face's source memory plus up to N of this keeper's
  // memories linked to the claimed subject. Always this keeper's own.
  const cited = new Set<string>();
  if (bestFace && own(bestFace.memory_id)) cited.add(bestFace.memory_id);
  if (claim) {
    const pool = bestFace
      ? input.personLinkedMemories
      : ownMemories.filter((m) =>
          (input.memoryNodeLinks[m.id] ?? []).includes(claim.subjectNodeId)
        );
    for (const m of pool) {
      if (cited.size >= CONFIG.retrieval.maxSubjectMemories + 1) break;
      if (own(m.id)) cited.add(m.id);
    }
  }

  return {
    keeperId: keeper.relativeId,
    claim,
    memoryIds: [...cited],
    v,
    r,
    reason,
  };
}

/**
 * DB-backed retrieval for one keeper. Face matching starts immediately on the
 * descriptors; the memory step waits on `embeddingPromise` so a strong face
 * match is never blocked by the vision caption.
 */
export async function retrieveKeeper(
  sb: SupabaseClient,
  familyId: string,
  keeper: Keeper,
  ctx: {
    faceDescriptors: number[][];
    embeddingPromise: Promise<number[]>;
  }
): Promise<KeeperResult> {
  // Face queries start right away.
  const facePromise = (async (): Promise<FaceMatch[]> => {
    const out: FaceMatch[] = [];
    for (const d of ctx.faceDescriptors) {
      const { data, error } = await sb.rpc("match_faces", {
        query: JSON.stringify(d),
        family: familyId,
        k: CONFIG.face.matchK,
      });
      if (error || !data) continue;
      out.push(...(data as FaceMatch[]));
    }
    return out;
  })();

  const memoryPromise = (async (): Promise<ScoredMemory[]> => {
    const embedding = await ctx.embeddingPromise;
    const { data, error } = await sb.rpc("match_memories", {
      query: JSON.stringify(embedding),
      contributor: keeper.relativeId,
      k: CONFIG.retrieval.topK,
    });
    if (error || !data) return [];
    return (data as { id: string; summary: string; similarity: number }[]).map(
      (m) => ({ id: m.id, summary: m.summary, similarity: m.similarity })
    );
  })();

  const faceMatches = await facePromise;

  const ownFaceMatches = faceMatches.filter(
    (m) => m.contributor_id === keeper.relativeId
  );
  const bestFace = ownFaceMatches.sort((a, b) => a.distance - b.distance)[0];
  const v = bestFace ? faceScore(bestFace.distance) : 0;

  // This keeper's memories linked to the best face person. Independent of the
  // embedding, so it runs concurrently with the memory step.
  const personLinkedPromise = (async (): Promise<ScoredMemory[]> => {
    if (!bestFace) return [];
    const { data: prov } = await sb
      .from("provenance")
      .select("memory_id")
      .eq("contributor_id", keeper.relativeId)
      .eq("node_id", bestFace.person_node_id);
    const ids = (prov ?? []).map((p) => p.memory_id);
    if (!ids.length) return [];
    const { data: mems } = await sb
      .from("memories")
      .select("id, summary")
      .in("id", ids)
      .eq("contributor_id", keeper.relativeId);
    return (mems ?? []).map((m) => ({
      id: m.id,
      summary: m.summary,
      similarity: 0,
    }));
  })();

  // A strong face match must not wait on the vision-caption embedding.
  const memories =
    v >= STRONG_FACE_V
      ? await Promise.race([
          memoryPromise,
          sleep(FAST_PATH_MEMORY_WAIT_MS).then(() => [] as ScoredMemory[]),
        ])
      : await memoryPromise;
  const personLinkedMemories = await personLinkedPromise;

  // Provenance links + node metadata for all cited/candidate memories and nodes.
  const memoryIds = new Set<string>(memories.map((m) => m.id));
  personLinkedMemories.forEach((m) => memoryIds.add(m.id));
  if (bestFace) memoryIds.add(bestFace.memory_id);

  const { data: provRows } = memoryIds.size
    ? await sb
        .from("provenance")
        .select("memory_id, node_id")
        .in("memory_id", [...memoryIds])
    : { data: [] };

  const memoryNodeLinks: Record<string, string[]> = {};
  const nodeIds = new Set<string>();
  for (const p of provRows ?? []) {
    if (!p.node_id) continue;
    (memoryNodeLinks[p.memory_id] ??= []).push(p.node_id);
    nodeIds.add(p.node_id);
  }
  faceMatches.forEach((m) => nodeIds.add(m.person_node_id));

  const nodeLabels: Record<string, string> = {};
  const nodeTypes: Record<string, string> = {};
  if (nodeIds.size) {
    const { data: nodes } = await sb
      .from("graph_nodes")
      .select("id, label, type")
      .in("id", [...nodeIds]);
    for (const n of nodes ?? []) {
      nodeLabels[n.id] = n.label;
      nodeTypes[n.id] = n.type;
    }
  }

  const memoryOwners: Record<string, string> = {};
  for (const id of memoryIds) memoryOwners[id] = keeper.relativeId;
  if (bestFace) memoryOwners[bestFace.memory_id] = keeper.relativeId;

  return buildKeeperResult(keeper, {
    faceMatches,
    nodeLabels,
    nodeTypes,
    memoryOwners,
    memories,
    memoryNodeLinks,
    personLinkedMemories,
  });
}

export async function runKeepers(
  sb: SupabaseClient,
  familyId: string,
  keepers: Keeper[],
  ctx: { faceDescriptors: number[][]; embeddingPromise: Promise<number[]> }
): Promise<KeeperResult[]> {
  return Promise.all(
    keepers.map((k) =>
      retrieveKeeper(sb, familyId, k, ctx).catch(
        (): KeeperResult => ({
          keeperId: k.relativeId,
          claim: null,
          memoryIds: [],
          v: 0,
          r: 0,
          reason: "keeper error",
        })
      )
    )
  );
}
