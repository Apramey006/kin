import type { SupabaseClient } from "@supabase/supabase-js";
import type { GraphNodeRow, MemoryRow, ProvenanceRow, Relative } from "./types";

/** Read-only, paginated service reads. Every provenance ID comes from scoped memories. */
export async function familyRows<T>(sb: SupabaseClient, table: string, familyId: string, columns = "*"): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await sb.from(table).select(columns).eq("family_id", familyId).order("id").range(offset,offset+499);
    if (result.error) throw result.error;
    rows.push(...result.data as T[]);
    if (result.data.length < 500) return rows;
  }
}

export async function loadFamilyEvidence(sb: SupabaseClient, familyId: string) {
  const [nodes, memories, relatives] = await Promise.all([
    familyRows<GraphNodeRow>(sb,"graph_nodes",familyId),
    familyRows<MemoryRow>(sb,"memories",familyId,"id,family_id,contributor_id,kind,summary,transcript,source,verified_facts,created_at,source_question_id"),
    familyRows<Relative>(sb,"relatives",familyId),
  ]);
  const provenance: ProvenanceRow[] = [];
  for (let start = 0; start < memories.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const result = await sb.from("provenance").select("*").in("memory_id",memories.slice(start,start+100).map(m=>m.id))
        .order("id").range(offset,offset+499);
      if (result.error) throw result.error;
      provenance.push(...result.data as ProvenanceRow[]);
      if (result.data.length < 500) break;
    }
  }
  return { nodes, memories, relatives, provenance };
}
