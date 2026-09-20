import type { SupabaseClient } from "@supabase/supabase-js";
import { CONFIG } from "./config";
import { clamp } from "./util";
import type { Keeper, KeeperResult } from "./types";

export const faceScore = (distance: number): number =>
  Number.isFinite(distance) ? clamp((CONFIG.face.vZeroDistance - distance) / CONFIG.face.vWindow) : 0;

export interface FaceMatch {
  person_node_id: string;
  contributor_id: string;
  memory_id: string;
  distance: number;
}

export interface KeeperInput {
  faceMatches: FaceMatch[];
  nodeLabels: Record<string, string>;
  memoryOwners: Record<string, string>;
  /** Direct provenance links to the recognized person, scoped to this relative. */
  personLinkedMemories: { id: string; summary: string }[];
}

export function buildKeeperResult(keeper: Keeper, input: KeeperInput): KeeperResult {
  const abstain = (reason: string): KeeperResult => ({
    keeperId: keeper.relativeId, claim: null, memoryIds: [], v: 0, r: 0, reason, evidence: [],
  });
  const own = (id: string) => input.memoryOwners[id] === keeper.relativeId;
  const matches = input.faceMatches
    .filter((m) => m.contributor_id === keeper.relativeId && Number.isFinite(m.distance) && m.distance >= 0)
    .sort((a, b) => a.distance - b.distance);
  const best = matches[0];
  if (!best || best.distance > CONFIG.face.maxDistance) return abstain("no strong enrolled face match");
  const rival = matches.find((m) => m.person_node_id !== best.person_node_id);
  if (rival && rival.distance - best.distance < CONFIG.face.ambiguityMargin) {
    return abstain("face matches more than one person");
  }
  if (!own(best.memory_id) || !input.nodeLabels[best.person_node_id]) return abstain("face source is missing");

  const evidence = input.personLinkedMemories.filter((m) => own(m.id));
  if (!evidence.some((m) => m.id === best.memory_id)) return abstain("face source has no subject provenance");
  // R is exact retrieval through the enrolled identity's provenance, not an
  // unrelated scene caption's similarity to a story. Text cannot identify a face.
  const cited = [evidence.find((m) => m.id === best.memory_id)!, ...evidence.filter((m) => m.id !== best.memory_id)]
    .slice(0, CONFIG.retrieval.maxSubjectMemories + 1);
  return {
    keeperId: keeper.relativeId,
    claim: { subjectNodeId: best.person_node_id, label: input.nodeLabels[best.person_node_id] },
    memoryIds: cited.map((m) => m.id),
    evidence: cited,
    v: faceScore(best.distance),
    r: 1,
    reason: `enrolled face (distance ${best.distance.toFixed(2)}), ${cited.length} linked memories`,
  };
}

export async function retrieveKeeper(
  sb: SupabaseClient,
  familyId: string,
  keeper: Keeper,
  ctx: { faceDescriptors: number[][] }
): Promise<KeeperResult> {
  if (ctx.faceDescriptors.length !== 1) {
    return { keeperId: keeper.relativeId, claim: null, memoryIds: [], v: 0, r: 0,
      reason: ctx.faceDescriptors.length ? "more than one face in frame" : "no face in frame" };
  }
  const { data, error } = await sb.rpc("match_keeper_faces", {
    query: JSON.stringify(ctx.faceDescriptors[0]), family: familyId,
    contributor: keeper.relativeId, k: CONFIG.face.matchK,
  });
  if (error) throw error;
  const faceMatches = (data ?? []) as FaceMatch[];
  const best = [...faceMatches].sort((a, b) => a.distance - b.distance)[0];
  const input: KeeperInput = { faceMatches, nodeLabels: {}, memoryOwners: {}, personLinkedMemories: [] };
  if (best && best.distance <= CONFIG.face.maxDistance) {
    const [node, prov] = await Promise.all([
      sb.from("graph_nodes").select("id, label").eq("family_id", familyId).eq("id", best.person_node_id).eq("type", "person").single(),
      sb.from("provenance").select("memory_id").eq("contributor_id", keeper.relativeId).eq("node_id", best.person_node_id),
    ]);
    if (node.error) throw node.error;
    if (prov.error) throw prov.error;
    if (node.data) input.nodeLabels[node.data.id] = node.data.label;
    const ids = [...new Set((prov.data ?? []).map((p) => p.memory_id))];
    if (ids.length) {
      const mems = await sb.from("memories").select("id, summary, contributor_id")
        .eq("family_id", familyId).eq("contributor_id", keeper.relativeId).in("id", ids)
        .order("created_at", { ascending: false });
      if (mems.error) throw mems.error;
      for (const m of mems.data ?? []) {
        input.memoryOwners[m.id] = m.contributor_id;
        input.personLinkedMemories.push({ id: m.id, summary: m.summary });
      }
    }
  }
  return buildKeeperResult(keeper, input);
}

export async function runKeepers(
  sb: SupabaseClient, familyId: string, keepers: Keeper[],
  ctx: { faceDescriptors: number[][] },
  onResult?: (result: KeeperResult) => Promise<void>
): Promise<KeeperResult[]> {
  return Promise.all(keepers.map(async (keeper) => {
    const result = await retrieveKeeper(sb, familyId, keeper, ctx).catch((): KeeperResult => ({
      keeperId: keeper.relativeId, claim: null, memoryIds: [], v: 0, r: 0,
      reason: "retrieval unavailable; check database and migration 002",
    }));
    await onResult?.(result);
    return result;
  }));
}
