"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getAnonClient } from "@/lib/supabase";
import { AuthBoundary, useKinAuth, authenticatedFetch, SignOutButton } from "@/lib/client-auth";
import { KeeperBar } from "@/components/KeeperBar";
import { GateMeter } from "@/components/GateMeter";
import { MemorySceneEntry } from "@/components/MemoryScene";
import { FamilyGraph } from "@/components/FamilyGraph";
import { CONFIG } from "@/lib/config";
import type { SceneData, SceneMemory } from "@/lib/memory-scene";
import type {
  GraphEdgeRow,
  GraphNodeRow,
  MemoryRow,
  ProvenanceRow,
  RecallEventRow,
  Relative,
  WeaverQuestionRow,
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

export default function StagePage() { return <AuthBoundary contributorOnly><StageContent /></AuthBoundary>; }

function StageContent() {
  const { familyId, contributorId, admin, role } = useKinAuth();
  const [question, setQuestion] = useState<WeaverQuestionRow | null>(null);
  const [relatives, setRelatives] = useState<Relative[]>([]);
  const [event, setEvent] = useState<RecallEventRow | null>(null);
  const [nodes, setNodes] = useState<GraphNodeRow[]>([]);
  const [edges, setEdges] = useState<GraphEdgeRow[]>([]);
  const [provenance, setProvenance] = useState<ProvenanceRow[]>([]);
  const [gapNodeId, setGapNodeId] = useState<string | null>(null);
  const [sceneMemories, setSceneMemories] = useState<SceneMemory[]>([]);
  const [sceneQuestions, setSceneQuestions] = useState<WeaverQuestionRow[]>([]);
  const [wearerNodeId, setWearerNodeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const actionPending = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const [{ data: n, error: ne }, { data: e, error: ee }, { data: p, error: pe }] = await Promise.all([
      sb.from("graph_nodes").select("*").eq("family_id", familyId),
      sb.from("graph_edges").select("*").eq("family_id", familyId),
      sb.from("provenance").select("*"),
    ]);
    if (ne || ee || pe) { setActionError("Could not refresh the family graph."); return; }
    setNodes((n ?? []) as GraphNodeRow[]);
    setEdges((e ?? []) as GraphEdgeRow[]);
    setProvenance((p ?? []) as ProvenanceRow[]);
    setWearerNodeId(
      (n ?? []).find((x: GraphNodeRow) => x.relation_to_wearer === "self")?.id ?? null
    );
  }, [familyId]);

  const loadLatestEvent = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const { data, error } = await sb
      .from("recall_events")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) { setActionError("Could not refresh recall status."); return; }
    setEvent((data?.[0] as RecallEventRow) ?? null);
  }, [familyId]);

  const loadGaps = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const { data, error } = await sb
      .from("weaver_questions")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) { setActionError("Could not refresh Weaver questions."); return; }
    const latest = (data?.[0] as WeaverQuestionRow) ?? null;
    setQuestion(latest);
    setGapNodeId(latest?.status === "open" ? latest.gap_node_id : null);
  }, [familyId]);

  const loadSceneSources = useCallback(async () => {
    const sb = getAnonClient();
    if (!sb) return;
    const [mems, qs] = await Promise.all([
      sb.from("memories").select("*").eq("family_id", familyId),
      sb.from("weaver_questions").select("*").eq("family_id", familyId),
    ]);
    if (mems.error || qs.error) return;
    const memories = (mems.data ?? []) as MemoryRow[];
    const paths = memories.map((m) => m.media_path).filter((p): p is string => !!p);
    const urls = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await sb.storage.from(CONFIG.storageBucket).createSignedUrls(paths, 3600);
      signed?.forEach((entry, i) => {
        if (entry?.signedUrl) urls.set(paths[i], entry.signedUrl);
      });
    }
    setSceneMemories(memories.map((m) => ({ ...m, mediaUrl: m.media_path ? (urls.get(m.media_path) ?? null) : null })));
    setSceneQuestions((qs.data ?? []) as WeaverQuestionRow[]);
  }, [familyId]);

  const loadRelatives = useCallback(async () => {
    const sb = getAnonClient(); if (!sb) return;
    const { data, error } = await sb.from("relatives").select("*").eq("family_id", familyId);
    if (error) { setActionError("Could not refresh family members."); return; }
    setRelatives((data ?? []) as Relative[]);
  }, [familyId]);

  useEffect(() => {
    const sb = getAnonClient();
    if (!sb) {
      setOffline(true);
      return;
    }
    loadRelatives();
    loadGraph();
    loadLatestEvent();
    loadGaps();
    loadSceneSources();

    const channel = sb
      .channel("stage")
      .on("postgres_changes", { event: "*", schema: "public", table: "recall_events", filter: `family_id=eq.${familyId}` }, loadLatestEvent)
      .on("postgres_changes", { event: "*", schema: "public", table: "graph_nodes", filter: `family_id=eq.${familyId}` }, loadGraph)
      .on("postgres_changes", { event: "*", schema: "public", table: "graph_edges", filter: `family_id=eq.${familyId}` }, loadGraph)
      .on("postgres_changes", { event: "*", schema: "public", table: "weaver_questions", filter: `family_id=eq.${familyId}` }, loadGaps)
      .subscribe();
    const refresh = setInterval(() => { loadGraph(); loadGaps(); loadLatestEvent(); loadSceneSources(); }, 3000);
    return () => {
      clearInterval(refresh);
      sb.removeChannel(channel);
    };
  }, [loadGraph, loadLatestEvent, loadGaps, loadRelatives, loadSceneSources, familyId]);

  const sceneData: SceneData = {
    relatives,
    memories: sceneMemories,
    nodes,
    edges,
    provenance,
    questions: sceneQuestions,
    relativeId: contributorId,
    role,
  };
  const refreshScene = useCallback(async () => {
    await Promise.all([loadGraph(), loadGaps(), loadRelatives(), loadSceneSources()]);
  }, [loadGraph, loadGaps, loadRelatives, loadSceneSources]);

  const call = async (label: string, fn: () => Promise<Response>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(label);
    setActionError(null);
    setActionStatus(null);
    try {
      const response = await requireOk(await fn());
      const result = await response.json().catch(() => null);
      if (label === "reset") { setEvent(null); setNodes([]); setEdges([]); setProvenance([]); setGapNodeId(null); setQuestion(null); }
      await Promise.all([loadGraph(), loadLatestEvent(), loadGaps(), loadRelatives()]);
      setActionStatus(label === "weaver" ? ({ created: "Question created.", existing_open: "Showing the existing open question.", no_gap: "No unanswered gap found.", no_target: "No available relative can answer this gap." }[String(result?.reason)] ?? "Weaver completed.") : "Action completed.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed. Please try again.");
    } finally {
      actionPending.current = false;
      setBusy(null);
    }
  };

  const seed = () => call("seed", () => authenticatedFetch("/api/admin/seed", { method: "POST" }));
  const reset = () => {
    if (actionPending.current) return;
    if (!window.confirm("Reset this family's demo data? This deletes its memories and cannot be undone.")) return;
    return call("reset", () => authenticatedFetch("/api/admin/reset", { method: "POST" }));
  };
  const runWeaver = () => call("weaver", () => authenticatedFetch("/api/weaver/run", { method: "POST" }));
  const replay = () =>
    call("replay", async () => {
      const r = await requireOk(await authenticatedFetch("/api/recall"));
      const { lastEventId } = await r.json();
      if (!lastEventId) throw new Error("No recall to replay yet. Try a recall from the wearer screen first.");
      return authenticatedFetch("/api/recall", {
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
            <span className="font-mono">family · {familyId}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-white/60">family · {familyId} <SignOutButton /></div>
      </header>

      {offline ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-xl text-white/55">
          Supabase is not configured. Fill .env.local and restart.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-4">
          <MemorySceneEntry data={sceneData} refresh={refreshScene} />
        </div>
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
              status={event?.status}
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
            {question && <div className="mx-5 mb-3 rounded-xl bg-white/5 p-3 text-sm max-h-52 overflow-y-auto">
              <p className="text-amber-300">{question.status === "answered" ? "Gap closed · answer recorded" : `Gap: ${question.gap_type}`} · {nodes.find((node) => node.id === question.gap_node_id)?.label ?? "Family memory"}</p>
              <p className="mt-1">Asked {relatives.find((relative) => relative.id === question.target_relative_id)?.name ?? "family member"}: {question.question_text}</p>
              <ul className="mt-2 space-y-1 text-white/60">{question.evidence.map((item) => <li key={item.memory_id}>{relatives.find((relative) => relative.id === item.contributor_id)?.name ?? "Relative"}: {item.summary} <span className="font-mono">[{item.memory_id.slice(0, 8)}]</span></li>)}</ul>
              {question.answer_memory_id && <p className="mt-2 text-emerald-300">Human answer memory: {question.answer_memory_id}</p>}
            </div>}
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

      <footer className="flex flex-wrap items-center gap-3 px-6 py-3 border-t border-white/10 text-sm">
        <button onClick={seed} disabled={busy !== null || !admin} className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed">
          {busy === "seed" ? "Seeding…" : "Seed"}
        </button>
        <button onClick={reset} disabled={busy !== null || !admin} className="rounded-lg bg-white/10 px-4 py-2 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed">
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
