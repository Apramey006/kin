"use client";
import { useRef, useState, useEffect } from "react";
import { Mic, Square, RotateCcw, Check } from "lucide-react";
import { Button } from "./ui/button";
export function Recorder({
  onRecorded,
  maxSeconds = 60,
  label = "Record a memory",
  disabled = false,
}: {
  onRecorded: (
    blob: Blob,
    mimeType: string,
  ) => void | boolean | Promise<void | boolean>;
  maxSeconds?: number;
  label?: string;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [draft, setDraft] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current && recorder.current.state !== "inactive") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!draft) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(draft);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [draft]);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
  };
  const start = async () => {
    setError(null);
    setStarting(true);
    setDraft(null);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording needs a supported browser on HTTPS or localhost.",
        );
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      const mime = ["audio/webm", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        const b = new Blob(chunks, {
          type: r.mimeType || mime || "audio/webm",
        });
        if (b.size) setDraft(b);
        else setError("Nothing was recorded. Give it another try.");
      };
      recorder.current = r;
      r.start();
      setRecording(true);
      setSeconds(0);
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(maxSeconds, elapsed));
        if (elapsed >= maxSeconds) stop();
      }, 250);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Allow microphone access in your browser, then try again."
          : e instanceof Error
            ? e.message
            : "Could not start recording.",
      );
    } finally {
      if (mounted.current) setStarting(false);
    }
  };
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await onRecorded(draft, draft.type);
      if (saved !== false) setDraft(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your recording couldn’t be saved. Try again.",
      );
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  return (
    <div className="stack">
      <div className="recorder-surface">
        {draft ? (
          <>
            <span className="pill">
              <Check aria-hidden="true" />
              Ready to listen
            </span>
            <h3 style={{ margin: "18px 0 10px" }}>Your recording</h3>
            <p className="small" style={{ marginBottom: 20 }}>
              Listen back before sharing it with your family.
            </p>
            {url && (
              <audio controls src={url} aria-label="Preview your recording" />
            )}
            <div
              className="row wrap"
              style={{ justifyContent: "center", marginTop: 20 }}
            >
              <Button
                variant="ghost"
                onClick={start}
                disabled={saving || disabled || starting}
              >
                <RotateCcw aria-hidden="true" />
                Record again
              </Button>
              <Button onClick={save} disabled={saving || disabled}>
                {saving || disabled ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                {saving || disabled ? "Saving your memory…" : "Save memory"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="small">
              {recording ? "Recording" : "Ready when you are."}
            </p>
            {recording ? (
              <>
                <div className="record-bars live" aria-hidden="true">
                  {[10, 22, 31, 18, 29, 35, 17, 25, 14, 28, 20, 8].map(
                    (h, i) => (
                      <i
                        key={i}
                        style={
                          {
                            "--h": `${h}px`,
                            "--delay": `${i * 0.08}s`,
                          } as React.CSSProperties
                        }
                      />
                    ),
                  )}
                </div>
              </>
            ) : (
              <div style={{ height: 20 }} />
            )}
            <p
              className="record-time"
              aria-label={`${seconds} seconds recorded`}
            >
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </p>
            <button
              type="button"
              className={`record-button ${recording ? "active" : ""}`}
              disabled={disabled || starting}
              onClick={recording ? stop : start}
              aria-label={recording ? "Stop recording" : label}
            >
              {starting ? (
                <span className="spinner" aria-hidden="true" />
              ) : recording ? (
                <Square aria-hidden="true" />
              ) : (
                <Mic aria-hidden="true" />
              )}
            </button>
            <p style={{ fontWeight: 600, fontSize: ".92rem" }}>
              {starting
                ? "Opening microphone…"
                : recording
                  ? "Tap to finish"
                  : label}
            </p>
            <p className="small" style={{ marginTop: 8 }}>
              {recording
                ? `Up to ${maxSeconds} seconds. You can listen back before saving.`
                : `Record up to ${maxSeconds} seconds. Listen before you save.`}
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <span className="sr-only" role="status">
        {recording
          ? "Recording started"
          : draft
            ? "Recording finished. Preview or save your memory."
            : ""}
      </span>
    </div>
  );
}
