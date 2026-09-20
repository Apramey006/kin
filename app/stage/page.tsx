"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Volume2,
  VolumeX,
  ScanFace,
  Info,
  MessageCircle,
  Check,
} from "lucide-react";
import { AppShell, LoadingView } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { MemorySceneEntry } from "@/components/MemoryScene";
import { Sheet } from "@/components/Sheet";
import { FamilyGraph } from "@/components/FamilyGraph";
import { useFamilyData, initials, relativeTime } from "@/lib/family-data";
import { SILENT_AUDIO, unlockAudio, playCue } from "@/lib/audio";
export default function Stage() {
  const { data, error, loading, live, refresh } = useFamilyData();
  const [busy, setBusy] = useState<"replay" | "weaver" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    audio.current = new Audio(SILENT_AUDIO);
    return () => {
      audio.current?.pause();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);
  const event = data?.events[0];
  const subject = data?.nodes.find((n) => n.id === event?.gate?.subjectNodeId);
  const hasKnown = data?.events.some((e) => e.status === "speak");
  const source = event?.cue_source;
  const question = data?.questions.find((q) => q.status === "open");
  const target = data?.relatives.find(
    (r) => r.id === question?.target_relative_id,
  );
  const replay = async () => {
    unlockAudio(audio.current);
    setBusy("replay");
    setActionError(null);
    try {
      const p = await fetch("/api/recall").then((r) => r.json());
      if (!p.lastEventId)
        throw new Error("Recognize someone first to listen again.");
      const r = await fetch("/api/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replayEventId: p.lastEventId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (j.decision === "speak") playCue(audio.current, j);
      else setNotice("No clear match. Kin stayed quiet.");
      await refresh();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not replay. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };
  const ask = async () => {
    setBusy("weaver");
    setActionError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/weaver/run", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setNotice(
        j.question
          ? "A question is ready for your relative in Memories."
          : "No new questions. Add more memories to find new connections.",
      );
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <AppShell data={data} className="connections-main">
      {loading ? (
        <LoadingView />
      ) : !data ? (
        <div className="empty-state">
          <h1>Connections</h1>
          <p role="alert">{error}</p>
          <Button onClick={refresh}>Try again</Button>
        </div>
      ) : (
        <>
          <header className="page-header">
            <div>
              <h1>Connections</h1>
              <p className="muted">
                The people, places, and stories in {data.wearer.name}’s life.
              </p>
            </div>
            <div className="page-actions">
              <span className={`live-indicator ${live ? "connected" : ""}`}>
                {live ? "Live" : "Updating"}
              </span>
              <button
                className="icon-button"
                onClick={() => setDetails(true)}
                aria-label="Recognition details"
              >
                <Info aria-hidden="true" />
              </button>
            </div>
          </header>
          {(error || actionError) && (
            <p role="alert" className="notice notice-error">
              {actionError || error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          <MemorySceneEntry data={data} refresh={refresh} onOpen={() => audio.current?.pause()} />
          <div className="connection-workspace">
            <div className="connection-canvas">
              <FamilyGraph
                nodes={data.nodes}
                edges={data.edges}
                provenance={data.provenance}
                relatives={data.relatives}
                wearerNodeId={
                  data.nodes.find((n) => n.relation_to_wearer === "self")?.id
                }
                subjectId={event?.gate?.subjectNodeId}
              />
              <div className="canvas-caption">
                <span>
                  {data.nodes.length}{" "}
                  {data.nodes.length === 1 ? "person" : "people and memories"} ·{" "}
                  {data.edges.length} connections
                </span>
                <Link href="/family" className="text-link">
                  Add memories
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <aside className="connection-inspector">
              <section className="current-moment" aria-live="polite">
                <p className="section-label">Latest recognition</p>
                {!event ? (
                  <>
                    <div className="recognition-symbol">
                      <ScanFace aria-hidden="true" />
                    </div>
                    <h2>Ready to recognize.</h2>
                    <p>
                      Point Kin at a familiar face to see which memories
                      connect.
                    </p>
                    <Link
                      href={data.faces.length ? "/wearer" : "/family"}
                      className="button button-primary"
                    >
                      {data.faces.length ? "Open camera" : "Add a photo"}
                    </Link>
                    <p className="caption">
                      Recognition needs labeled photos from two family members.
                    </p>
                  </>
                ) : event.status === "running" ? (
                  <>
                    <div className="recognition-symbol">
                      <span className="spinner" aria-hidden="true" />
                    </div>
                    <h2>Looking for a match</h2>
                    <p>Checking your family’s photos and memories.</p>
                  </>
                ) : event.status === "silent" ? (
                  <>
                    <div className="recognition-symbol quiet">
                      <VolumeX aria-hidden="true" />
                    </div>
                    <h2>No clear match</h2>
                    <p>
                      Kin stayed quiet. A memory is spoken only when your
                      family’s photos agree.
                    </p>
                    {hasKnown && (
                      <Button
                        variant="outline"
                        onClick={replay}
                        disabled={!!busy}
                      >
                        <Volume2 aria-hidden="true" />
                        Replay known person
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="recognized-person">
                      <span className="person-monogram">
                        {initials(subject?.label ?? "Kin")}
                      </span>
                      <span className="match-badge">
                        <Check size={12} aria-hidden="true" />
                        Recognized
                      </span>
                    </div>
                    <h2>{subject?.label ?? "A familiar face"}</h2>
                    <p className="person-relation">
                      {subject?.relation_to_wearer &&
                      subject.relation_to_wearer !== "self"
                        ? `${data.wearer.name}’s ${subject.relation_to_wearer}`
                        : "Family"}
                    </p>
                    <blockquote>
                      {source ? `“${source.quote}”` : event.cue_text}
                    </blockquote>
                    <p className="caption">
                      {source
                        ? `Shared by ${source.contributorName}`
                        : "From your family"}
                    </p>
                    <Button
                      variant="outline"
                      onClick={replay}
                      disabled={!!busy}
                    >
                      {busy === "replay" ? (
                        <span className="spinner" aria-hidden="true" />
                      ) : (
                        <Volume2 aria-hidden="true" />
                      )}
                      {busy === "replay" ? "Loading…" : "Listen again"}
                    </Button>
                  </>
                )}
              </section>
              {event && (
                <section className="recognition-sources">
                  <h3>Family sources</h3>
                  {data.relatives.map((r) => {
                    const k = event.keeper_results?.find(
                      (k) => k.keeperId === r.id,
                    );
                    return (
                      <details className="source-detail" key={r.id}>
                        <summary>
                          <span className="avatar">{initials(r.name)}</span>
                          <span>
                            {r.name}
                            <small>
                              {k?.claim
                                ? `Recognized ${k.claim.label}`
                                : event.status === "running"
                                  ? "Checking…"
                                  : "No match"}
                            </small>
                          </span>
                          {k?.claim && (
                            <Check
                              className="source-check"
                              aria-hidden="true"
                            />
                          )}
                        </summary>
                        {k?.evidence?.length ? (
                          k.evidence.map((m) => (
                            <p className="source-evidence" key={m.id}>
                              {m.summary}
                            </p>
                          ))
                        ) : (
                          <p className="caption">
                            No supporting memory for this recognition.
                          </p>
                        )}
                      </details>
                    );
                  })}
                </section>
              )}
            </aside>
          </div>
          <section className="question-strip">
            <span className="question-icon">
              <MessageCircle aria-hidden="true" />
            </span>
            <div>
              <h2>
                {question
                  ? `A question for ${target?.name ?? "your family"}`
                  : "Complete the story"}
              </h2>
              <p>
                {question?.question_text ??
                  "Find a missing detail your family might remember."}
              </p>
            </div>
            {question ? (
              target?.id === data.relativeId ? (
                <Link href="/family" className="button button-secondary">
                  Record an answer
                </Link>
              ) : (
                <span className="caption">Waiting for an answer</span>
              )
            ) : (
              <Button
                variant="outline"
                disabled={!!busy || !data.memories.length}
                onClick={ask}
              >
                {busy === "weaver" ? "Looking…" : "Find a question"}
              </Button>
            )}
          </section>
          {!!data.events.length && (
            <section className="recent-recognition">
              <h2>Recent activity</h2>
              <div>
                {data.events.slice(0, 3).map((e) => (
                  <p key={e.id}>
                    <span>
                      {e.status === "speak" ? (
                        <Volume2 aria-hidden="true" />
                      ) : (
                        <VolumeX aria-hidden="true" />
                      )}
                      {e.status === "speak"
                        ? `${data.nodes.find((n) => n.id === e.gate?.subjectNodeId)?.label ?? "Someone familiar"} recognized`
                        : e.status === "running"
                          ? "Finding a match"
                          : "No clear match"}
                    </span>
                    <time dateTime={e.created_at}>
                      {relativeTime(e.created_at)}
                    </time>
                  </p>
                ))}
              </div>
            </section>
          )}
          <Sheet
            open={details}
            onClose={() => setDetails(false)}
            title="Recognition details"
          >
            <p className="sheet-intro">
              Kin needs matching photos from two relatives before speaking.
              These signals describe the match; they are not a probability of
              correctness.
            </p>
            {event ? (
              <>
                <dl className="signal-list">
                  {(
                    [
                      ["V", "Visual match"],
                      ["R", "Memory retrieval"],
                      ["A", "Family agreement"],
                      ["S", "Sources"],
                      ["X", "Disagreement"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{event.gate?.[key]?.toFixed(2) ?? "—"}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>Score / threshold</dt>
                    <dd>
                      {event.gate?.C?.toFixed(3) ?? "—"} /{" "}
                      {event.gate?.threshold ?? 0.8}
                    </dd>
                  </div>
                  <div>
                    <dt>Server time</dt>
                    <dd>{event.latency_ms ?? "—"} ms</dd>
                  </div>
                </dl>
                <p className="caption">
                  {event.silence_reason || event.gate?.reason}
                </p>
              </>
            ) : (
              <p>No recognition yet.</p>
            )}
          </Sheet>
        </>
      )}
    </AppShell>
  );
}
