"use client";

import { authenticatedFetch } from "@/lib/client-auth";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, FileAudio } from "lucide-react";
import { Sheet } from "@/components/Sheet";
import { storyExcerpt, type AudioSegment, type StoryMemory } from "@/lib/living-stories";
import type { GraphNodeRow } from "@/lib/types";
import styles from "./stories.module.css";

interface Source { transcript: string | null; mediaUrl: string | null; segments: AudioSegment[] }
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function StoryPlayer({ memory, topic, name, autoPlay, paused, onComplete, onPlaying }: {
  memory: StoryMemory; topic: GraphNodeRow; name: string; autoPlay: boolean; paused: boolean;
  onComplete: () => void; onPlaying: (playing: boolean) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const originalAudio = useRef<HTMLAudioElement>(null);
  const finished = useRef(false);
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [original, setOriginal] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onComplete, onPlaying });
  callbacks.current = { onComplete, onPlaying };
  const excerpt = source ? storyExcerpt(source.segments, source.transcript ?? "", topic) : null;
  const start = excerpt?.start ?? 0;
  const end = excerpt?.end ?? duration;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setSource(null);
    authenticatedFetch(`/api/stories/${encodeURIComponent(memory.id)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "This recording could not be loaded.");
        if (!controller.signal.aborted) setSource(body);
      }).catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Please try again.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); callbacks.current.onPlaying(false); };
  }, [memory.id, attempt]);

  useEffect(() => {
    const element = audio.current;
    if (!element || !source || !autoPlay || paused) return;
    element.play().catch(() => setError("Tap Play to listen to this chapter."));
    return () => { element.pause(); };
    // Start only on a new source; closing a sheet must not resume unexpectedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, autoPlay]);

  useEffect(() => { if (paused) audio.current?.pause(); }, [paused]);
  useEffect(() => {
    const stop = () => { if (document.hidden) { audio.current?.pause(); originalAudio.current?.pause(); } };
    document.addEventListener("visibilitychange", stop);
    const element = audio.current;
    return () => { document.removeEventListener("visibilitychange", stop); element?.pause(); };
  }, [source]);

  const play = () => {
    const element = audio.current;
    if (!element) return;
    if (!element.paused) { element.pause(); return; }
    setError(null);
    if (finished.current || element.currentTime < start || (end > 0 && element.currentTime >= end)) {
      element.currentTime = start;
      finished.current = false;
    }
    element.play().catch(() => setError("Playback could not start. Try Play again, or reload the recording."));
  };
  const complete = () => {
    if (finished.current) return;
    finished.current = true;
    audio.current?.pause();
    callbacks.current.onComplete();
  };
  const quote = source?.transcript ?? memory.transcript;
  const generated = memory.source?.generated_audio === true;
  return <div className={styles.player}>
    <blockquote className={styles.quote}>{excerpt?.text || quote}</blockquote>
    <p className={styles.attribution}>{generated ? `Demo narration · ${name}` : `${name}’s ${excerpt ? "recording · excerpt" : "original recording"}`}</p>
    {source?.mediaUrl && <audio ref={audio} src={source.mediaUrl} preload="metadata"
      onLoadedMetadata={() => {
        const element = audio.current!;
        setDuration(Number.isFinite(element.duration) ? element.duration : 0);
        element.currentTime = start;
        setPosition(start);
      }}
      onDurationChange={() => { const value = audio.current?.duration; if (value && Number.isFinite(value)) setDuration(value); }}
      onTimeUpdate={() => {
        const element = audio.current!;
        setPosition(element.currentTime);
        if (excerpt && !element.paused && element.currentTime >= excerpt.end) complete();
      }}
      onPlay={() => { setPlaying(true); callbacks.current.onPlaying(true); }}
      onPause={() => { setPlaying(false); callbacks.current.onPlaying(false); }}
      onEnded={complete}
      onError={() => { setError("This recording is unavailable. Reload it or continue to the next chapter."); setPlaying(false); callbacks.current.onPlaying(false); }} />}
    <div className={styles.transport}>
      <button className={styles.play} onClick={play} disabled={loading || !source?.mediaUrl} aria-label={playing ? "Pause chapter" : "Play chapter"}>
        {playing ? <Pause aria-hidden="true" fill="currentColor" /> : <Play aria-hidden="true" fill="currentColor" />}
        {loading ? "Loading…" : playing ? "Pause" : "Play"}
      </button>
      <div className={styles.progress}>
        <label className="sr-only" htmlFor={`position-${memory.id}`}>Recording position</label>
        <input id={`position-${memory.id}`} type="range" min={start} max={Math.max(start + 0.01, end)} step="0.1"
          value={Math.max(start, Math.min(position, end || start))} disabled={!source?.mediaUrl || end <= start}
          aria-valuetext={`${time(Math.max(0, position - start))} of ${time(Math.max(0, end - start))}`}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (audio.current) audio.current.currentTime = next;
            finished.current = false; setPosition(next);
          }} />
        <span>{time(Math.max(0, position - start))} <span>{time(Math.max(0, end - start))}</span></span>
      </div>
    </div>
    {!loading && source && !source.mediaUrl && <p className={styles.hint}>The transcript is available, but this memory has no playable recording. You can read it and continue.</p>}
    {error && <p className={styles.error} role="alert">{error} <button onClick={() => setAttempt((n) => n + 1)}><RotateCcw size={14} aria-hidden="true" /> Reload recording</button></p>}
    <button className={styles.sourceLink} onClick={() => { audio.current?.pause(); setOriginal(true); }}><FileAudio size={16} aria-hidden="true" /> Open original memory</button>
    <Sheet open={original} onClose={() => { originalAudio.current?.pause(); setOriginal(false); }} title={`Shared by ${name}`}>
      <p className="small muted">{new Date(memory.created_at).toLocaleDateString(undefined, { dateStyle: "long" })} · {generated ? "AI-generated demo narration" : "Original recording"}</p>
      <p className={styles.sourceTranscript}>{quote}</p>
      {original && source?.mediaUrl && <audio ref={originalAudio} controls src={source.mediaUrl} aria-label={generated ? `Full demo narration for ${name}` : `Full original recording from ${name}`} />}
      <p className="small muted" style={{ marginTop: 16 }}>This is the complete contribution, with its surrounding context.</p>
    </Sheet>
  </div>;
}
