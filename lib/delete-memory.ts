import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove one contribution and only the graph facts that lose their last source.
 * Keep the memory until cleanup succeeds so a failed request can be retried.
 */
export async function deleteMemory(sb: SupabaseClient, familyId: string, contributorId: string, memoryId: string) {
  const found = await sb.from("memories").select("id, media_path")
    .eq("family_id", familyId).eq("contributor_id", contributorId).eq("id", memoryId).maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) return false;

  const [sources, nodes, edges, faces, questions, events] = await Promise.all([
    sb.from("provenance").select("memory_id, node_id, edge_id, memories!inner(family_id)").eq("memories.family_id", familyId),
    sb.from("graph_nodes").select("id, relation_to_wearer").eq("family_id", familyId),
    sb.from("graph_edges").select("id, from_node, to_node").eq("family_id", familyId),
    sb.from("face_embeddings").select("id, person_node_id, memory_id").eq("family_id", familyId),
    sb.from("weaver_questions").select("id, gap_node_id, answer_memory_id, evidence").eq("family_id", familyId),
    sb.from("recall_events").select("id, evidence, gate, keeper_results").eq("family_id", familyId),
  ]);
  for (const result of [sources, nodes, edges, faces, questions, events]) if (result.error) throw result.error;
  const own = sources.data!.filter((p) => p.memory_id === memoryId);
  const remaining = sources.data!.filter((p) => p.memory_id !== memoryId);
  const edgeIds = edges.data!.filter((e) => own.some((p) => p.edge_id === e.id)
    && !remaining.some((p) => p.edge_id === e.id)).map((e) => e.id);
  const retainedEdges = edges.data!.filter((e) => !edgeIds.includes(e.id));
  const nodeIds = nodes.data!.filter((n) => n.relation_to_wearer !== "self"
    && (own.some((p) => p.node_id === n.id) || edges.data!.some((e) => edgeIds.includes(e.id) && (e.from_node === n.id || e.to_node === n.id)))
    && !remaining.some((p) => p.node_id === n.id)
    && !retainedEdges.some((e) => e.from_node === n.id || e.to_node === n.id)
    && !faces.data!.some((f) => f.person_node_id === n.id && f.memory_id !== memoryId)).map((n) => n.id);
  const questionIds = questions.data!.filter((q) => q.answer_memory_id === memoryId
    || nodeIds.includes(q.gap_node_id)
    || (q.evidence as { memory_id: string }[]).some((e) => e.memory_id === memoryId)).map((q) => q.id);
  const eventIds = events.data!.filter((e) => e.evidence?.some((source: {memoryId?:string}) => source.memoryId === memoryId)
    || e.gate?.citedMemoryIds?.includes(memoryId)
    || e.keeper_results?.some((k: { memoryIds?: string[] }) => k.memoryIds?.includes(memoryId))).map((e) => e.id);

  if (found.data.media_path) {
    const removed = await sb.storage.from("media").remove([found.data.media_path]);
    if (removed.error) throw removed.error;
  }
  if (eventIds.length) {
    const updated = await sb.from("recall_events").update({ status: "silent", cue_text: null, evidence: [], selected_fact_ids: [], face_outcome: null, reason_code: "insufficient_evidence",
      keeper_results: [], gate: null, silence_reason: "A source memory was removed. Tap again." })
      .eq("family_id", familyId).in("id", eventIds);
    if (updated.error) throw updated.error;
  }
  // Questions cache summaries and answered questions hold an FK to the memory.
  // Removing them lets Weaver ask again using the remaining evidence.
  for (const [table, ids] of [["weaver_questions", questionIds], ["graph_edges", edgeIds], ["graph_nodes", nodeIds]] as const) {
    if (!ids.length) continue;
    const removed = await sb.from(table).delete().eq("family_id", familyId).in("id", ids);
    if (removed.error) throw removed.error;
  }
  // A retry receipt must not resurrect a removed contribution as a fake success.
  const receipts = await sb.from("ingestion_receipts").delete().eq("family_id",familyId).eq("contributor_id",contributorId).in("id",[memoryId,...faces.data!.filter(f=>f.memory_id === memoryId).map(f=>f.id)]);
  if(receipts.error) throw receipts.error;
  // FK cascades remove this memory's provenance and enrolled face descriptors.
  const removed = await sb.from("memories").delete().eq("family_id", familyId)
    .eq("contributor_id", contributorId).eq("id", memoryId);
  if (removed.error) throw removed.error;
  return true;
}
