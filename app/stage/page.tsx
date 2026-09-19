"use client";

import { useCallback, useEffect, useState } from "react";
import { getAnonClient, FAMILY_ID } from "@/lib/supabase";
import { KeeperBar } from "@/components/KeeperBar";
import { GateMeter } from "@/components/GateMeter";
import { FamilyGraph } from "@/components/FamilyGraph";
import { CONFIG } from "@/lib/config";
import type {
  GraphEdgeRow,
  GraphNodeRow,
  ProvenanceRow,
  RecallEventRow,
  Relative,
} from "@/lib/types";

export default function StagePage() {
  const [relatives, setRelatives] = useState<Relative[]>([]);
  const [event, setEvent] = useState<RecallEventRow | null>(null);
  const [nodes, setNodes] = useState<GraphNodeRow[]>([]);
  const [edges, setEdges] = useState<GraphEdgeRow[]>([]);
  const [provenance, setProvenance] = useState<ProvenanceRow[]>([]);
  const [gapNodeId, setGapNodeId] = useState<string | null>(null);
  const [wearerNodeId, setWearerNodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const loadGraph = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const [{ data: n }, { data: e }, { data: p }] = await Promise.all([
      sb.from("graph_nodes").select("*").eq("family_id", FAMILY_ID),
      sb.from("graph_edges").select("*").eq("family_id", FAMILY_ID),
      sb.from("provenance").select("*"),
    ]);
    setNodes((n ?? []) as GraphNodeRow[]);
    setEdges((e ?? []) as GraphEdgeRow[]);
    setProvenance((p ?? []) as ProvenanceRow[]);
    setWearerNodeId(
      (n ?? []).find((x: GraphNodeRow) => x.relation_to_wearer === "self")?.id ?? null
    );
  }, []);

  const loadLatestEvent = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const { data } = await sb
      .from("recall_events")
      .select("*")
      .eq("family_id", FAMILY_ID)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]) setEvent(data[0] as RecallEventRow);
  }, []);

  const loadGaps = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const { data } = await sb
      .from("weaver_questions")
      .select("gap_node_id")
      .eq("family_id", FAMILY_ID)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1);
    setGapNodeId(data?.[0]?.gap_node_id ?? null);
  }, []);

  useEffect(() => {
    const sb = getAnonClient();
    if (!sb) {
      setOffline(true);
      return;
    }
    sb.from("relatives")
      .select("*")
      .eq("family_id", FAMILY_ID)
      .then(({ data }) => setRelatives((data ?? []) as Relative[]));
    loadGraph();
    loadLatestEvent();
    loadGaps();

    const channel = sb
      .channel("stage")
      .on("postgres_changes", { event: "*", schema: "public", table: "recall_events", filter: `family_id=eq.${FAMILY_ID}` }, loadLatestEvent)
      .on("postgres_changes", { event: "*", schema: "public", table: "graph_nodes", filter: `family_id=eq.${FAMILY_ID}` }, loadGraph)
      .on("postgres_changes", { event: "*", schema: "public", table: "graph_edges", filter: `family_id=eq.${FAMILY_ID}` }, loadGraph)
      .on("postgres_changes", { event: "*", schema: "public", table: "weaver_questions", filter: `family_id=eq.${FAMILY_ID}` }, loadGaps)
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [loadGraph, loadLatestEvent, loadGaps]);

  const call = async (label: string, fn: () => Promise<Response>) => {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const seed = () => call("seed", () => fetch("/api/admin/seed", { method: "POST" }));
  const reset = () => call("reset", () => fetch("/api/admin/reset", { method: "POST" }));
  const runWeaver = () => call("weaver", () => fetch("/api/weaver/run", { method: "POST" }));
  const replay = () =>
    call("replay", async () => {
      const r = await fetch("/api/recall");
      const { lastEventId } = await r.json();
      if (!lastEventId) return new Response();
      return fetch("/api/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replayEventId: lastEventId }),
      });
    });

  const keeperById = new Map(
    (event?.keeper_results ?? []).map((r) => [r.keeperId, r])
  );

  return (
    <main className="h-screen w-screen bg-stage text-white flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div className="text-2xl font-bold tracking-wide">
          Kin <span className="text-white/40 font-normal">· family memory</span>
        </div>
        <div className="text-white/40">demo family · {FAMILY_ID}</div>
      </header>

      {offline ? (
        <div className="flex-1 flex items-center justify-center text-white/60 text-xl">
          Supabase is not configured. Fill .env.local and restart.
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 min-h-0 overflow-y-auto lg:overflow-visible">
          <section className="rounded-2xl bg-white/5 p-5 overflow-y-auto min-h-[320px]">
            <h2 className="text-xl uppercase tracking-widest text-white/50 mb-5">
              Keepers
            </h2>
            {relatives.map((r) => (
              <KeeperBar
                key={r.id}
                name={r.name}
                color={r.color}
                result={keeperById.get(r.id)}
                busy={event?.status === "running"}
              />
            ))}
            {!relatives.length && (
              <p className="text-white/40">Seed the demo to create Keepers.</p>
            )}
          </section>

          <section className="rounded-2xl bg-white/5 p-5 overflow-y-auto min-h-[320px]">
            <GateMeter
              gate={event?.gate ?? null}
              running={event?.status === "running"}
              cueText={event?.cue_text}
              latencyMs={event?.latency_ms}
              silenceReason={event?.silence_reason}
            />
          </section>

          <section className="rounded-2xl bg-white/5 overflow-hidden flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-xl uppercase tracking-widest text-white/50">
                Family graph
              </h2>
              <button
                onClick={runWeaver}
                className="rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 px-4 py-2 text-lg hover:bg-amber-500/30"
              >
                {busy === "weaver" ? "Weaving…" : "Run Weaver"}
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <FamilyGraph
                nodes={nodes}
                edges={edges}
                provenance={provenance}
                relatives={relatives}
                gapNodeId={gapNodeId}
                wearerNodeId={wearerNodeId}
              />
            </div>
          </section>
        </div>
      )}

      <footer className="flex items-center gap-3 px-6 py-3 border-t border-white/10 text-sm">
        <button onClick={seed} className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20">
          {busy === "seed" ? "Seeding…" : "Seed"}
        </button>
        <button onClick={reset} className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20">
          {busy === "reset" ? "Resetting…" : "Reset"}
        </button>
        <button onClick={replay} className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20">
          {busy === "replay" ? "Replaying…" : "Replay last recall"}
        </button>
        <div className="ml-auto text-white/35 font-mono text-xs">
          gate: {CONFIG.gate.wV}V {CONFIG.gate.wR}R {CONFIG.gate.wA}A{" "}
          {CONFIG.gate.wS}S -{CONFIG.gate.wX}X | threshold{" "}
          {CONFIG.gate.threshold} | face v=({CONFIG.face.vZeroDistance}-d)/
          {CONFIG.face.vWindow} | sim floor {CONFIG.retrieval.simFloor}
        </div>
      </footer>
    </main>
  );
}
