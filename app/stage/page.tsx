"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

async function requireOk(response: Response): Promise<Response> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.error === "string" && body.error.trim()
        ? body.error
        : `Request failed (${response.status}). Please try again.`
    );
  }
  return response;
}

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
  const actionPending = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

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
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(label);
    setActionError(null);
    setActionStatus(null);
    try {
      await requireOk(await fn());
      setActionStatus("Action completed.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed. Please try again.");
    } finally {
      actionPending.current = false;
      setBusy(null);
    }
  };

  const seed = () => call("seed", () => fetch("/api/admin/seed", { method: "POST" }));
  const reset = () => {
    if (actionPending.current) return;
    if (!window.confirm("Reset this family's demo data? This deletes its memories and cannot be undone.")) return;
    return call("reset", () => fetch("/api/admin/reset", { method: "POST" }));
  };
  const runWeaver = () => call("weaver", () => fetch("/api/weaver/run", { method: "POST" }));
  const replay = () =>
    call("replay", async () => {
      const r = await requireOk(await fetch("/api/recall"));
      const { lastEventId } = await r.json();
      if (!lastEventId) throw new Error("No recall to replay yet. Try a recall from the wearer screen first.");
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
    <main className="on-stage flex h-screen w-screen flex-col overflow-hidden bg-stage text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold tracking-[-0.01em]">Kin</span>
          <span className="text-sm uppercase tracking-[0.22em] text-white/35">
            family memory
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/graph" className="rounded-lg border border-emerald-200/20 bg-emerald-200/5 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-200/10">
            Explore Memory Atlas ↗
          </Link>
          <div className="hidden items-center gap-2 text-xs text-white/35 sm:flex">
            <span
              className={`h-2 w-2 rounded-full ${
                event?.status === "running" ? "kin-pulse bg-emerald-400" : "bg-white/25"
              }`}
              aria-hidden
            />
            <span className="font-mono">demo family · {FAMILY_ID}</span>
          </div>
        </div>
      </header>

      {offline ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xl text-white/55">
          Supabase is not configured. Fill .env.local and restart.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-3 lg:overflow-visible">
          <section className="stage-panel flex min-h-[320px] flex-col overflow-hidden">
            <div className="px-5 pb-3 pt-4">
              <h2 className="panel-label">Keepers</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">
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
                <p className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-white/35">
                  Seed the demo to create Keepers.
                </p>
              )}
            </div>
          </section>

          <section className="stage-panel min-h-[320px] overflow-y-auto p-5">
            <GateMeter
              gate={event?.gate ?? null}
              running={event?.status === "running"}
              cueText={event?.cue_text}
              latencyMs={event?.latency_ms}
              silenceReason={event?.silence_reason}
            />
          </section>

          <section className="stage-panel flex min-h-[320px] flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
              <h2 className="panel-label">Family graph</h2>
              <button
                onClick={runWeaver}
                disabled={busy !== null}
                className="rounded-xl border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-accent/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "weaver" ? "Weaving…" : "Run Weaver"}
              </button>
            </div>
            <div className="min-h-0 flex-1">
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

      {(actionError || actionStatus) && (
        <div className="px-6 pb-1">
          {actionError && (
            <p
              role="alert"
              className="animate-fade-up inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-sm text-amber-200"
            >
              {actionError}
            </p>
          )}
          {actionStatus && (
            <p
              role="status"
              className="animate-fade-up inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/65"
            >
              {actionStatus}
            </p>
          )}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-white/[0.02] px-6 py-3 text-sm">
        <button onClick={seed} disabled={busy !== null} className="stage-button">
          {busy === "seed" ? "Seeding…" : "Seed"}
        </button>
        <button onClick={reset} disabled={busy !== null} className="stage-button">
          {busy === "reset" ? "Resetting…" : "Reset"}
        </button>
        <button onClick={replay} disabled={busy !== null} className="stage-button">
          {busy === "replay" ? "Replaying…" : "Replay last recall"}
        </button>
        <div className="ml-auto font-mono text-[11px] leading-relaxed text-white/30">
          gate: {CONFIG.gate.wV}V {CONFIG.gate.wR}R {CONFIG.gate.wA}A{" "}
          {CONFIG.gate.wS}S -{CONFIG.gate.wX}X | threshold{" "}
          {CONFIG.gate.threshold} | face v=({CONFIG.face.vZeroDistance}-d)/
          {CONFIG.face.vWindow} | sim floor {CONFIG.retrieval.simFloor}
        </div>
      </footer>
    </main>
  );
}
