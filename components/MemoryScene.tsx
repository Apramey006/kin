"use client";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Layers,
  MapPin,
  MessageCircle,
  Mic,
  Plus,
  Quote,
  RefreshCw,
  X,
} from "lucide-react";
import {
  memoryScene,
  type MemorySceneData,
  type SceneData,
  type SceneMemory,
} from "@/lib/memory-scene";
import { useMemoryUnfold } from "@/lib/use-memory-unfold";
import { Recorder } from "./Recorder";

type Selection = { kind: "memory"; id: string } | { kind: "connection" } | null;

export function MemorySceneEntry({
  data,
  refresh,
  onOpen,
}: {
  data: SceneData;
  refresh: () => Promise<void>;
  onOpen?: () => void;
}) {
  const scene = useMemo(() => memoryScene(data), [data]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!anchor) {
      element?.close();
      return;
    }
    document.querySelectorAll("audio").forEach((audio) => audio.pause());
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [anchor]);
  if (!scene && !anchor) return null;
  return (
    <>
      <button
        className="memory-scene-entry"
        onClick={() => {
          onOpen?.();
          setAnchor(scene!.anchor.id);
        }}
      >
        <span className="scene-entry-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <Layers />
        </span>
        <span>
          <small>A story to step inside</small>
          <strong>{scene?.anchor.label ?? "Your family’s story"}</strong>
          <span>
            One memory. {scene?.perspectives.length ?? 0} family{" "}
            {scene?.perspectives.length === 1 ? "perspective" : "perspectives"}.
          </span>
        </span>
        <span className="scene-entry-action">
          Unfold the story <ArrowUpRight size={18} aria-hidden="true" />
        </span>
      </button>
      <dialog
        ref={dialog}
        className="memory-scene-dialog"
        aria-labelledby={title}
        onCancel={(e) => {
          e.preventDefault();
          if (!saving) setAnchor(null);
        }}
      >
        {anchor && (
          <SceneWorld
            data={data}
            anchorId={anchor}
            titleId={title}
            refresh={refresh}
            onClose={() => setAnchor(null)}
            saving={saving}
            setSaving={setSaving}
          />
        )}
      </dialog>
    </>
  );
}

function SceneWorld({
  data,
  anchorId,
  titleId,
  refresh,
  onClose,
  saving,
  setSaving,
}: {
  data: SceneData;
  anchorId: string;
  titleId: string;
  refresh: () => Promise<void>;
  onClose: () => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
}) {
  const scene = useMemo(() => memoryScene(data, anchorId), [data, anchorId]);
  const world = useRef<HTMLDivElement>(null);
  const motion = useMemoryUnfold(world);
  const [selected, setSelected] = useState<Selection>(null);
  const [arrival, setArrival] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const previousOrigin = useRef(scene?.origin?.source.memory.id ?? null);
  const previousAnswer = useRef(scene?.latestAnswer?.memory.id ?? null);
  const [failedPhoto, setFailedPhoto] = useState(false);
  const originId = scene?.origin?.source.memory.id ?? null;
  useEffect(() => {
    if (originId && previousOrigin.current !== originId)
      setArrival(
        `${scene?.origin?.source.name} connected another piece of the story.`,
      );
    if (!originId) setArrival(null);
    previousOrigin.current = originId;
  }, [originId, scene?.origin?.source.name]);
  useEffect(() => {
    const answerId = scene?.latestAnswer?.memory.id ?? null;
    if (!originId && answerId && previousAnswer.current !== answerId)
      setArrival(
        `${scene?.latestAnswer?.name} added a recollection. The origin is still open.`,
      );
    previousAnswer.current = answerId;
  }, [originId, scene?.latestAnswer?.memory.id, scene?.latestAnswer?.name]);
  useEffect(() => {
    if (selected) detailHeading.current?.focus({ preventScroll: true });
  }, [selected]);
  const openDetail = (selection: Selection) => {
    if (saving) return;
    opener.current = document.activeElement as HTMLElement;
    motion.unfold();
    setSelected(selection);
  };
  const closeDetail = () => {
    if (saving) return;
    setSelected(null);
    opener.current?.focus({ preventScroll: true });
  };
  const check = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };
  if (!scene)
    return (
      <div className="scene-gone">
        <h1 id={titleId}>This story has changed.</h1>
        <p>Its source memories are no longer available.</p>
        <button className="scene-button" onClick={onClose}>
          Back to your family
        </button>
      </div>
    );
  const central = scene.photo
    ? {
        memory: scene.photo,
        name: scene.photoOwner!,
        relation:
          data.relatives.find((r) => r.id === scene.photo?.contributor_id)
            ?.relation_to_wearer ?? "relative",
        color: "#c6ae79",
      }
    : scene.perspectives[0];
  const sides = scene.perspectives
    .filter((p) => p.memory.contributor_id !== central?.memory.contributor_id)
    .slice(0, 2);
  const selectedMemory =
    selected?.kind === "memory"
      ? data.memories.find((m) => m.id === selected.id)
      : null;
  const selectedPerson = data.relatives.find(
    (r) => r.id === selectedMemory?.contributor_id,
  );
  const answer = async (blob: Blob, mime: string) => {
    if (
      !scene.question ||
      scene.question.target_relative_id !== data.relativeId
    )
      return false;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new File([blob], `answer.${mime.includes("mp4") ? "m4a" : "webm"}`, {
          type: mime,
        }),
      );
      fd.append("contributor_id", data.relativeId!);
      fd.append("question_id", scene.question.id);
      const result = await fetch("/api/weaver/answer", {
        method: "POST",
        body: fd,
      });
      const body = await result.json();
      if (!result.ok)
        throw new Error(body.error ?? "Your answer couldn’t be saved.");
      await refresh();
      return true;
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className={`scene-world ${motion.expanded ? "is-unfolded" : "is-folded"} ${motion.reduced ? "is-still" : ""} ${selected ? "has-detail" : ""} ${arrival && scene.origin ? "has-new-connection" : ""}`}
      ref={world}
    >
      <header className="scene-topbar">
        <span className="scene-wordmark">
          kin<span>Family stories</span>
        </span>
        <button
          className="scene-close"
          aria-label="Close story"
          onClick={onClose}
          disabled={saving}
        >
          <X size={19} aria-hidden="true" />
          Done
        </button>
      </header>
      <div className="scene-heading">
        <span className="scene-kicker">A little moment. A whole world.</span>
        <h1 id={titleId}>{scene.anchor.label}</h1>
        <p>
          {motion.expanded
            ? "Different voices. The same shared story."
            : "There’s more to this memory than meets the eye."}
        </p>
      </div>
      <div className="scene-stage" aria-label="An unfolding family story">
        <div className="scene-light" aria-hidden="true" />
        <svg
          className="scene-threads"
          viewBox="0 0 1000 650"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={`${titleId}-thread`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop stopColor="#ead9ae" />
              <stop offset="1" stopColor="#8a7651" />
            </linearGradient>
          </defs>
          <path
            className="thread-left desktop-thread"
            visibility={sides.length > 0 ? "visible" : "hidden"}
            d="M500 175 C420 245 310 255 200 340"
            pathLength="1"
            stroke={`url(#${titleId}-thread)`}
          />
          <path
            className="thread-right desktop-thread"
            visibility={sides.length > 1 ? "visible" : "hidden"}
            d="M500 175 C605 225 740 245 800 360"
            pathLength="1"
            stroke={`url(#${titleId}-thread)`}
          />
          <path
            className={`thread-origin desktop-thread ${scene.origin ? "is-connected" : ""}`}
            d="M500 230 C430 390 570 440 500 570"
            pathLength="1"
          />
          <path
            className="thread-left mobile-thread"
            visibility={sides.length > 0 ? "visible" : "hidden"}
            d="M500 100 C430 195 435 255 435 290"
            pathLength="1"
            stroke={`url(#${titleId}-thread)`}
          />
          <path
            className="thread-right mobile-thread"
            visibility={sides.length > 1 ? "visible" : "hidden"}
            d="M500 100 C780 240 650 385 565 440"
            pathLength="1"
            stroke={`url(#${titleId}-thread)`}
          />
          <path
            className={`thread-origin mobile-thread ${scene.origin ? "is-connected" : ""}`}
            d="M500 150 C370 280 780 480 500 590"
            pathLength="1"
          />
        </svg>
        {sides.map((p, i) => (
          <button
            key={p.memory.id}
            className={`scene-fragment fragment-${i + 1}`}
            aria-label={`Explore ${p.name}’s memory`}
            tabIndex={motion.expanded ? 0 : -1}
            aria-hidden={!motion.expanded}
            onClick={() => openDetail({ kind: "memory", id: p.memory.id })}
          >
            <span className="fragment-topline">
              <span
                className="fragment-person"
                style={{
                  background: `color-mix(in srgb, ${p.color} 30%, white)`,
                }}
              >
                {p.name[0]}
              </span>
              <span>
                {p.name}
                <small>{p.relation}</small>
              </span>
              {p.memory.mediaUrl && p.memory.kind !== "photo" ? (
                <Mic aria-hidden="true" />
              ) : (
                <Quote aria-hidden="true" />
              )}
            </span>
            <span className="fragment-quote">
              {p.memory.transcript
                ? `“${p.memory.transcript}”`
                : p.memory.caption || p.memory.summary}
            </span>
            <span className="fragment-foot">
              {p.memory.mediaUrl && p.memory.kind !== "photo"
                ? "Hear their memory"
                : "Read their memory"}
              <ArrowUpRight size={16} aria-hidden="true" />
            </span>
          </button>
        ))}
        <div className="scene-center">
          <button
            className="scene-photograph"
            {...motion.handle}
            aria-label={
              motion.expanded ? "Fold the memory" : "Unfold the memory"
            }
            aria-expanded={motion.expanded}
            disabled={saving}
          >
            <span className="scene-photo-surface">
              {scene.photo?.mediaUrl && !failedPhoto ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={scene.photo.mediaUrl}
                    alt={scene.photo.caption || "A photograph from your family"}
                    draggable={false}
                    onError={() => setFailedPhoto(true)}
                  />
                </>
              ) : (
                <span className="scene-letter">
                  <Quote aria-hidden="true" />
                  <span>
                    {central?.memory.transcript || scene.anchor.label}
                  </span>
                </span>
              )}
            </span>
            <span className="scene-photo-note">
              {scene.photo
                ? `${central?.name}’s photograph`
                : `Remembered by ${central?.name}`}
            </span>
          </button>
          {central && (
            <button
              className="scene-photo-source"
              onClick={() =>
                openDetail({ kind: "memory", id: central.memory.id })
              }
              tabIndex={motion.expanded ? 0 : -1}
              aria-hidden={!motion.expanded}
            >
              Explore {central.name}’s memory{" "}
              <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          className={`scene-missing ${scene.origin ? "is-complete" : ""}`}
          onClick={() => openDetail({ kind: "connection" })}
          tabIndex={motion.expanded ? 0 : -1}
          aria-hidden={!motion.expanded}
          aria-label={
            scene.origin
              ? `Explore the connection: ${scene.origin.node.label}`
              : "Explore the missing piece"
          }
        >
          <span className="missing-icon">
            {scene.origin ? (
              <Check aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
          </span>
          <span>
            <small>
              {scene.origin
                ? `Connected by ${scene.origin.source.name}`
                : "One piece is still missing"}
            </small>
            <strong>
              {scene.origin ? scene.origin.node.label : "Where did it begin?"}
            </strong>
            <span>
              {scene.origin
                ? "Follow the new connection"
                : scene.recipient
                  ? `${scene.recipient.name} might remember`
                  : "An invitation to remember"}
            </span>
          </span>
        </button>
        <div className="scene-pull-hint" aria-hidden={motion.expanded}>
          <ArrowDown size={17} aria-hidden="true" />
          <span>
            {motion.reduced
              ? "Tap the photograph to unfold"
              : "Pull the photograph up. See what unfolds."}
          </span>
        </div>
      </div>
      <footer className="scene-controls">
        <button
          className="scene-control-button"
          disabled={saving}
          onClick={() => {
            if (motion.expanded) {
              closeDetail();
              motion.fold();
            } else motion.unfold();
          }}
        >
          <Layers size={18} aria-hidden="true" />
          {motion.expanded ? "Bring it together" : "Unfold the memory"}
        </button>
        <div className="scene-perspectives" aria-label="Family perspectives">
          {scene.perspectives.map((p) => (
            <button
              key={p.memory.id}
              onClick={() => openDetail({ kind: "memory", id: p.memory.id })}
              disabled={saving}
            >
              <span
                style={{
                  background: `color-mix(in srgb, ${p.color} 30%, white)`,
                }}
              >
                {p.name[0]}
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <button
          className="scene-control-button scene-refresh"
          onClick={check}
          disabled={checking}
          aria-label="Check for new memories"
        >
          <RefreshCw size={16} aria-hidden="true" />
          {checking ? "Checking…" : "Live story"}
        </button>
      </footer>
      <p
        className={`scene-arrival ${arrival ? "has-arrival" : ""}`}
        role="status"
        aria-live="polite"
      >
        {arrival}
      </p>
      {selected && (
        <aside className="scene-detail" aria-label="Memory details">
          <button
            className="scene-detail-close"
            aria-label="Close memory details"
            onClick={closeDetail}
            disabled={saving}
          >
            <X size={20} aria-hidden="true" />
          </button>
          <span className="scene-kicker">
            {selected.kind === "connection"
              ? scene.origin
                ? "Another piece, connected"
                : "An unfinished story"
              : "A family perspective"}
          </span>
          <h2 tabIndex={-1} ref={detailHeading}>
            {selected.kind === "connection"
              ? scene.origin
                ? scene.origin.node.label
                : "Where did it begin?"
              : `${selectedPerson?.name ?? "Your family"} remembers`}
          </h2>
          {selected.kind === "memory" ? (
            selectedMemory ? (
              <MemoryDetail
                key={selectedMemory.id}
                memory={selectedMemory}
                name={selectedPerson?.name ?? "Your family"}
              />
            ) : (
              <p>This memory has been removed.</p>
            )
          ) : (
            <ConnectionDetail
              scene={scene}
              data={data}
              saving={saving}
              onAnswer={answer}
              onReturnToMemories={onClose}
            />
          )}
        </aside>
      )}
    </div>
  );
}

function MemoryDetail({
  memory,
  name,
}: {
  memory: SceneMemory;
  name: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = audio.current;
    return () => element?.pause();
  }, []);
  return (
    <div className="scene-detail-content">
      {memory.kind === "photo" && memory.mediaUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={memory.mediaUrl}
            alt={memory.caption || `A photograph shared by ${name}`}
          />
        </>
      )}
      {memory.transcript ? (
        <blockquote>“{memory.transcript}”</blockquote>
      ) : (
        <p>{memory.caption || memory.summary}</p>
      )}
      <p className="scene-detail-credit">
        Shared by {name}
        <br />
        <time dateTime={memory.created_at}>
          {new Date(memory.created_at).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </time>
      </p>
      {memory.kind !== "photo" && memory.mediaUrl && (
        <div className="scene-original">
          <span>
            <Mic size={16} aria-hidden="true" />
            Original recording
          </span>
          <audio
            ref={audio}
            src={memory.mediaUrl}
            controls
            preload="none"
            aria-label={`Listen to ${name}’s recording`}
          />
        </div>
      )}
    </div>
  );
}

function ConnectionDetail({
  scene,
  data,
  saving,
  onAnswer,
  onReturnToMemories,
}: {
  scene: MemorySceneData;
  data: SceneData;
  saving: boolean;
  onAnswer: (blob: Blob, mime: string) => Promise<boolean>;
  onReturnToMemories: () => void;
}) {
  if (scene.origin)
    return (
      <>
        <div className="scene-origin-label">
          <MapPin aria-hidden="true" />
          <span>
            {scene.anchor.label}
            <ArrowDown size={14} aria-hidden="true" />
            {scene.origin.node.label}
          </span>
        </div>
        <MemoryDetail
          key={scene.origin.source.memory.id}
          memory={scene.origin.source.memory}
          name={scene.origin.source.name}
        />
      </>
    );
  return (
    <div className="scene-detail-content">
      <div className="scene-question-symbol">
        <MessageCircle aria-hidden="true" />
      </div>
      <p>
        {scene.question?.question_text ??
          "Your family has shared this memory, but its origin hasn’t been recorded yet."}
      </p>
      {scene.latestAnswer && (
        <div className="scene-waiting">
          <strong>{scene.latestAnswer.name} added a recollection</strong>
          <MemoryDetail
            key={scene.latestAnswer.memory.id}
            memory={scene.latestAnswer.memory}
            name={scene.latestAnswer.name}
          />
          <p>The origin is still an open question.</p>
        </div>
      )}
      {scene.question?.target_relative_id === data.relativeId &&
      data.role !== "loved_one" ? (
        <Recorder
          onRecorded={onAnswer}
          disabled={saving}
          label="Record the missing piece"
        />
      ) : (
        <div className="scene-waiting">
          <span className="scene-waiting-dot" />
          <strong>
            {scene.recipient
              ? `Waiting for ${scene.recipient.name}`
              : "There’s more to remember"}
          </strong>
          <p>
            {scene.recipient
              ? `When ${scene.recipient.name} answers in Memories, the new source will appear here. The connection completes when the answer supplies an origin.`
              : "Add a family recollection or use Connections to find a question."}
          </p>
          <Link
            href="/family"
            className="scene-text-link"
            onClick={onReturnToMemories}
          >
            Go to family memories <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      )}
      <p className="scene-source-note">
        An open question, not a missing fact Kin can guess.
      </p>
    </div>
  );
}
