import type { SupabaseClient } from "@supabase/supabase-js";
import type { GraphEdgeRow, GraphNodeRow } from "@/lib/types";
import type { Extraction } from "@/lib/extract";
import { findNodeByLabel, isAllowedRel, normLabel } from "@/lib/graph";
import { stableId } from "./ids";
import { IngestionError } from "./http";
import type { IngestionIdentity } from "./auth";

export function prepareGraph(identity: IngestionIdentity, memoryId: string, extraction: Extraction, existing: GraphNodeRow[], existingEdges: GraphEdgeRow[] = []) {
  const nodes: GraphNodeRow[] = [];
  const refs = new Map<string, string>();
  const chips: { label: string; type: string; relation_to_wearer: string | null }[] = [];
  for (const node of extraction.nodes) {
    if (refs.has(node.ref)) throw new IngestionError(502, "Duplicate extraction reference");
    let resolved = node.ref.startsWith("existing:")
      ? existing.find((candidate) => candidate.id === node.ref.slice(9) && candidate.type === node.type)
      : findNodeByLabel([...existing, ...nodes], node.type, node.label);
    if (node.ref.startsWith("existing:") && !resolved) throw new IngestionError(502, "Unknown extraction reference");
    if (!resolved) {
      resolved = {
        id: stableId(identity.familyId, node.type, normLabel(node.label)),
        family_id: identity.familyId, type: node.type, label: node.label,
        aliases: [], relation_to_wearer: node.type === "person" ? node.relation_to_wearer : null,
      };
      nodes.push(resolved);
    }
    refs.set(node.ref, resolved.id);
    chips.push({ label: resolved.label, type: resolved.type, relation_to_wearer: resolved.relation_to_wearer });
  }
  const edges = extraction.edges.map((edge) => {
    const from = refs.get(edge.from);
    const to = refs.get(edge.to);
    if (!from || !to || !isAllowedRel(edge.rel)) throw new IngestionError(502, "Invalid extracted relationship");
    const existingEdge = existingEdges.find((candidate) => candidate.from_node === from && candidate.to_node === to && candidate.rel === edge.rel);
    return { id: existingEdge?.id ?? stableId(identity.familyId, from, edge.rel, to), family_id: identity.familyId,
      from_node: from, rel: edge.rel, to_node: to };
  });
  const nodeIds = [...new Set(refs.values())];
  const provenance = [
    ...nodeIds.map((nodeId) => ({ id: stableId(memoryId, "node", nodeId), memory_id: memoryId,
      contributor_id: identity.contributorId, node_id: nodeId, edge_id: null })),
    ...edges.map((edge) => ({ id: stableId(memoryId, "edge", edge.id), memory_id: memoryId,
      contributor_id: identity.contributorId, node_id: null, edge_id: edge.id })),
  ];
  return { nodes, edges, provenance, chips, refs };
}

export async function existingReceipt(sb: SupabaseClient, identity: IngestionIdentity, id: string, requestHash: string) {
  const { data, error } = await sb.from("ingestion_receipts").select("request_hash, response")
    .eq("id", id).eq("family_id", identity.familyId).eq("contributor_id", identity.contributorId).maybeSingle();
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)) throw new IngestionError(503, "Atomic ingestion migration required");
    throw error;
  }
  if (data && data.request_hash !== requestHash) throw new IngestionError(409, "Idempotency key or question already used with different content");
  return data?.response ?? null;
}

export async function commitIngestion(sb: SupabaseClient, payload: Record<string, unknown>) {
  const { data, error } = await sb.rpc("commit_ingestion", { payload });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) throw new IngestionError(503, "Atomic ingestion migration required");
    if (error.code === "23505") throw new IngestionError(409, "Request conflicts with a completed ingestion");
    throw error;
  }
  if (!data) throw new Error("Missing ingestion result");
  return data;
}
