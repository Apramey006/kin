"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FAMILY_ID, getAnonClient } from "@/lib/supabase";
import { EMPTY_MEMORY_GRAPH, type MemoryGraphData } from "@/lib/memory-graph";
import type { GraphEdgeRow, GraphNodeRow, MemoryRow, ProvenanceRow, Relative } from "@/lib/types";

export function useMemoryGraph(enabled: boolean) {
  const [data, setData] = useState<MemoryGraphData>(EMPTY_MEMORY_GRAPH);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const generation = useRef(0);
  const loading = useRef(false);

  const refresh = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) { setStatus("error"); return; }
    if (loading.current) return;
    loading.current = true;
    const current = generation.current;
    try {
      async function familyRows<Row>(table: string, columns = "*") {
        const result: Row[] = [];
        for (let start = 0; ; start += 1000) {
          const { data: rows, error } = await sb!.from(table).select(columns).eq("family_id", FAMILY_ID)
            .order("id", { ascending: true }).range(start, start + 999);
          if (error) throw error;
          result.push(...(rows as Row[]));
          if (rows.length < 1000) return result;
        }
      }
      const [nodes, edges, memories, relatives] = await Promise.all([
        familyRows<GraphNodeRow>("graph_nodes"), familyRows<GraphEdgeRow>("graph_edges"),
        familyRows<MemoryRow>("memories", "id,family_id,contributor_id,kind,media_path,transcript,caption,summary,source_question_id,created_at"),
        familyRows<Relative>("relatives"),
      ]);
      const provenance: ProvenanceRow[] = [];
      for (let offset = 0; offset < memories.length; offset += 100) {
        for (let start = 0; ; start += 1000) {
          const result = await sb.from("provenance").select("*")
            .in("memory_id", memories.slice(offset, offset + 100).map((memory) => memory.id))
            .order("id", { ascending: true }).range(start, start + 999);
          if (result.error) throw result.error;
          provenance.push(...result.data as ProvenanceRow[]);
          if (result.data.length < 1000) break;
        }
      }
      if (generation.current !== current) return;
      const next = { nodes, edges, memories, provenance, relatives };
      setData((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setStatus("ready");
    } catch {
      if (generation.current === current) setStatus("error");
    } finally {
      if (generation.current === current) loading.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const currentGeneration = generation.current;
    refresh();
    const poll = window.setInterval(() => { if (!document.hidden) refresh(); }, 5000);
    const sb = getAnonClient();
    let debounce: ReturnType<typeof setTimeout>;
    const changed = () => { clearTimeout(debounce); debounce = setTimeout(refresh, 300); };
    const channel = sb?.channel("memory-atlas")
      .on("postgres_changes", { event: "*", schema: "public", table: "graph_nodes", filter: `family_id=eq.${FAMILY_ID}` }, changed)
      .on("postgres_changes", { event: "*", schema: "public", table: "graph_edges", filter: `family_id=eq.${FAMILY_ID}` }, changed)
      .on("postgres_changes", { event: "*", schema: "public", table: "weaver_questions", filter: `family_id=eq.${FAMILY_ID}` }, changed)
      .subscribe();
    return () => {
      generation.current = currentGeneration + 1;
      loading.current = false;
      clearInterval(poll);
      clearTimeout(debounce);
      if (channel) sb?.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { data, status, refresh };
}
