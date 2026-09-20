"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  ImagePlus,
  Mic,
  ArrowRight,
  Heart,
  Trash2,
  Image as ImageIcon,
  MessageCircle,
  Images,
} from "lucide-react";
import { AppShell, LoadingView, PrivacyNote } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/Sheet";
import { PhotoUploader } from "@/components/PhotoUploader";
import { Recorder } from "@/components/Recorder";
import { WeaverInbox } from "@/components/WeaverInbox";
import {
  useFamilyData,
  initials,
  relativeTime,
  type FamilyData,
} from "@/lib/family-data";
type Memory = FamilyData["memories"][number];
export default function FamilyPage() {
  const { data, error, loading, refresh } = useFamilyData();
  const [compose, setCompose] = useState<"choose" | "photo" | "story" | null>(
    null,
  );
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Memory | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const me = data?.relatives.find((r) => r.id === data.relativeId);
  const saveStory = async (blob: Blob, mime: string) => {
    if (!me) return false;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new File([blob], `story.${mime.includes("mp4") ? "m4a" : "webm"}`, {
          type: mime,
        }),
      );
      fd.append("contributor_id", me.id);
      const r = await fetch("/api/memories/story", {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Your memory couldn’t be saved.");
      setCompose(null);
      setNotice("Voice memory saved.");
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleting || !me) return;
    setBusy(true);
    setActionError(null);
    try {
      const r = await fetch(
        `/api/memories/${deleting.id}?contributor_id=${me.id}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not delete this memory.");
      setDeleting(null);
      setNotice("Memory and its upload deleted.");
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const memories =
    data?.memories.filter(
      (m) =>
        filter === "all" ||
        (filter === "mine" && m.contributor_id === me?.id) ||
        (filter === "photos" && m.kind === "photo") ||
        (filter === "stories" && m.kind !== "photo"),
    ) ?? [];
  return (
    <AppShell data={data}>
      {loading ? (
        <LoadingView />
      ) : !data || !me ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Heart aria-hidden="true" />
          </div>
          <h1>Your family is close by.</h1>
          <p role="alert">{error ?? "We’re getting your family ready."}</p>
          <Button onClick={refresh}>Try again</Button>
        </div>
      ) : (
        <>
          <header className="page-header library-header">
            <div>
              <h1>Memories</h1>
              <p className="muted">{data.wearer.name}’s family library</p>
            </div>
            <Button onClick={() => setCompose("choose")}>
              <Plus aria-hidden="true" />
              Add a memory
            </Button>
          </header>
          <Link href="/stories" className="notice" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <span><strong>Living Stories</strong> · Hear your family’s memories come together.</span><ArrowRight size={20} aria-hidden="true" />
          </Link>
          {notice && (
            <p
              className="notice notice-success"
              role="status"
              style={{ marginBottom: 24 }}
            >
              {notice}
            </p>
          )}
          {error && (
            <p
              className="notice notice-error"
              role="alert"
              style={{ marginBottom: 24 }}
            >
              {error}
            </p>
          )}
          <div className="family-layout">
            <div className="family-primary">
              <WeaverInbox
                me={me}
                relatives={data.relatives}
                questions={data.questions}
                onAnswered={refresh}
              />
              <div
                className="segmented"
                role="group"
                aria-label="Filter memories"
              >
                {[
                  ["all", "All"],
                  ["photos", "Photos"],
                  ["stories", "Stories"],
                  ["mine", "By you"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {memories.length ? (
                <div className="memory-grid">
                  {memories.map((m) => {
                    const owner = data.relatives.find(
                      (r) => r.id === m.contributor_id,
                    );
                    return (
                      <article className="memory-card animate-in" key={m.id}>
                        {m.kind === "photo" && m.mediaUrl && (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className="memory-image"
                              src={m.mediaUrl}
                              alt={
                                m.caption || "A photo shared with your family"
                              }
                              loading="lazy"
                            />
                          </>
                        )}
                        <div className="memory-card-content">
                          <div className="memory-card-meta">
                            <span className="avatar">
                              {initials(owner?.name ?? "Family")}
                            </span>
                            <div>
                              <strong>
                                {owner?.name ?? "Your family"}
                                {m.contributor_id === me.id ? " · You" : ""}
                              </strong>
                              <time dateTime={m.created_at}>
                                {relativeTime(m.created_at)}
                              </time>
                            </div>
                            <span
                              className="memory-kind"
                              aria-label={
                                m.kind === "photo"
                                  ? "Photo"
                                  : m.kind === "answer"
                                    ? "Answer"
                                    : "Voice memory"
                              }
                            >
                              {m.kind === "photo" ? (
                                <ImageIcon aria-hidden="true" />
                              ) : m.kind === "answer" ? (
                                <MessageCircle aria-hidden="true" />
                              ) : (
                                <Mic aria-hidden="true" />
                              )}
                            </span>
                          </div>
                          {m.transcript ? (
                            <p className="memory-quote">“{m.transcript}”</p>
                          ) : (
                            <p className="memory-caption">{m.summary}</p>
                          )}
                          {m.mediaUrl && m.kind !== "photo" && (
                            <audio
                              controls
                              preload="none"
                              src={m.mediaUrl}
                              aria-label={`Listen to ${owner?.name ?? "your relative"}’s memory`}
                            />
                          )}
                          <div className="memory-card-actions">
                            <span className="pill pill-neutral">
                              {m.kind === "answer"
                                ? "A missing piece"
                                : m.kind === "photo"
                                  ? "A familiar moment"
                                  : "In their words"}
                            </span>
                            {m.contributor_id === me.id && (
                              <button
                                className="button button-quiet button-sm"
                                onClick={() => {
                                  setDeleting(m);
                                  setActionError(null);
                                }}
                                aria-label={`Delete memory: ${m.summary}`}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                                <span className="sr-only">Delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="library-empty">
                  <div className="empty-photo-stack" aria-hidden="true">
                    <span />
                    <span />
                    <span>
                      <Images />
                    </span>
                  </div>
                  <h2>
                    {data.memories.length
                      ? "No memories in this view"
                      : "Your memories belong here."}
                  </h2>
                  <p>
                    {data.memories.length
                      ? "Choose a different view, or add a memory."
                      : `Add a photo or record a story for ${data.wearer.name}. Your family can add theirs, too.`}
                  </p>
                  <Button variant="ghost" onClick={() => setCompose("choose")}>
                    {data.memories.length
                      ? "Add a memory"
                      : "Add your first memory"}
                    <Plus aria-hidden="true" />
                  </Button>
                  {!data.memories.length && (
                    <Link className="text-link" href="/settings#invite-heading">
                      Invite family
                    </Link>
                  )}
                </div>
              )}
              {!!data.memories.length && (
                <p className="library-count">
                  {data.memories.length}{" "}
                  {data.memories.length === 1 ? "memory" : "memories"} · Shared
                  with {data.relatives.length}{" "}
                  {data.relatives.length === 1 ? "person" : "people"}
                </p>
              )}
            </div>
          </div>
          <PrivacyNote />
          <Sheet
            open={!!compose}
            onClose={() => setCompose(null)}
            busy={busy}
            title={
              compose === "photo"
                ? "Add photo"
                : compose === "story"
                  ? "Record a memory"
                  : "Add a memory"
            }
          >
            {compose === "choose" ? (
              <>
                <p className="sheet-intro">Choose a photo or record a story.</p>
                <div className="stack">
                  <button
                    className="choice-card"
                    onClick={() => setCompose("photo")}
                  >
                    <ImagePlus aria-hidden="true" />
                    <span>
                      <strong>A photo</strong>
                      <small>Label the people in a family photo.</small>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                  <button
                    className="choice-card"
                    onClick={() => setCompose("story")}
                  >
                    <Mic aria-hidden="true" />
                    <span>
                      <strong>A voice memory</strong>
                      <small>Record a story in your own words.</small>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : compose === "photo" ? (
              <PhotoUploader
                onBusy={setBusy}
                contributorId={me.id}
                personNodes={data.nodes.filter((n) => n.type === "person")}
                onDone={() => {
                  setCompose(null);
                  setNotice(
                    "Your photo is now part of your family’s memories.",
                  );
                  refresh();
                }}
              />
            ) : (
              <>
                <p className="sheet-intro">
                  Say who you’re remembering and a little thing that makes them
                  special.
                </p>
                <Recorder
                  label="Record a memory"
                  onRecorded={saveStory}
                  disabled={busy}
                />
              </>
            )}
          </Sheet>
          <Sheet
            open={!!deleting}
            onClose={() => setDeleting(null)}
            title="Delete this memory?"
            busy={busy}
          >
            <p className="sheet-intro">
              Its photo or recording and face labels will be removed, too. Other
              family memories will stay. This can’t be undone.
            </p>
            {actionError && (
              <p className="notice notice-error" role="alert">
                {actionError}
              </p>
            )}
            <div className="row" style={{ marginTop: 24 }}>
              <Button
                className="full"
                variant="outline"
                onClick={() => setDeleting(null)}
                disabled={busy}
              >
                Keep memory
              </Button>
              <Button
                className="full"
                variant="danger"
                onClick={remove}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete memory"}
              </Button>
            </div>
          </Sheet>
        </>
      )}
    </AppShell>
  );
}
