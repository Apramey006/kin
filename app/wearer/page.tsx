"use client";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ScanFace,
  Headphones,
  Volume2,
  RotateCcw,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useFamilyData } from "@/lib/family-data";

import { SILENT_AUDIO, unlockAudio, playCue, stopCue } from "@/lib/audio";
import { authenticatedFetch } from "@/lib/client-auth";
import { CONFIG } from "@/lib/config";
export default function Wearer() {
  const { data } = useFamilyData();
  const video = useRef<HTMLVideoElement | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [cue, setCue] = useState<string | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    audio.current = new Audio(SILENT_AUDIO);
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      pending.current?.abort();
      stopCue(audio.current);
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    if (enabled && video.current && stream.current)
      video.current.srcObject = stream.current;
  }, [enabled]);
  const start = async () => {
    setError(null);
    setReady(false);
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access needs HTTPS or localhost. Open Kin using a secure address.",
        );
      stream.current?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = s;
      if (video.current) video.current.srcObject = s;
      setEnabled(true);

      if (mounted.current) setReady(true);
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera access is turned off. Allow it in your browser settings, then try again."
          : e instanceof Error
            ? e.message
            : "The camera couldn’t open. Try again.",
      );
    } finally {
      if (mounted.current) setStarting(false);
    }
  };
  const recognize = async () => {
    if (pending.current || thinking || !ready) return;
    unlockAudio(audio.current);
    const v = video.current;
    if (!v?.videoWidth) {
      setError("The camera is still getting ready. Try again in a moment.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setThinking(true);
    setCue(null);
    setQuiet(false);
    setError(null);
    try {
      const scale = Math.min(1, CONFIG.snapshotMaxPx / v.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("The camera image couldn’t be captured.")),
          "image/jpeg",
          0.85,
        ),
      );
      const fd = new FormData();
      fd.append(
        "snapshot",
        new File([blob], "snapshot.jpg", { type: "image/jpeg" }),
      );
      const r = await authenticatedFetch("/api/recall", { method: "POST", body: fd, signal: controller.signal });
      const j = await r.json();
      if (!r.ok)
        throw new Error(j.error ?? "Kin couldn’t connect. Please try again.");
      if (!mounted.current || controller.signal.aborted) return;
      if (j.decision === "speak") {
        setCue(j.cueText);
        playCue(audio.current, j);
      } else {
        if (j.reasonCode === "provider_failure") setError("Recognition is temporarily unavailable. Please try again.");
        else setQuiet(true);
      }
    } catch (e) {
      if (mounted.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      pending.current = null;
      if (mounted.current) setThinking(false);
    }
  };
  return (
    <AppShell data={data} className="recognition-main">
      <div className="wearer-content">
        <p className="recognition-for muted">{data ? `For ${data.wearer.name}` : "A familiar connection"}</p>
        {!enabled ? (
          <div className="camera-intro">
            <div className="camera-orb">
              <ScanFace aria-hidden="true" />
            </div>
            <h1>
              A familiar face.
              <br />A gentle reminder.
            </h1>
            <p>
              Point the camera at someone you know, or their photo. Tap once to
              hear a memory from your family.
            </p>
            <Button
              className="full"
              size="lg"
              onClick={start}
              disabled={starting}
            >
              {starting ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <Camera aria-hidden="true" />
              )}
              {starting ? "Opening your camera…" : "Open camera"}
            </Button>
            <p className="small" style={{ marginTop: 20 }}>
              Kin stays quiet when it isn’t sure.
            </p>
          </div>
        ) : (
          <>
            <div className="camera-view">
              <video
                ref={video}
                autoPlay
                playsInline
                muted
                aria-label="Camera view for recognizing a familiar face"
              />
              <div className="camera-corners" aria-hidden="true" />
              <span className="camera-label">
                {thinking
                  ? "Finding a memory…"
                  : !ready
                    ? "Getting ready…"
                    : "One familiar face at a time"}
              </span>
              {cue && (
                <div className="camera-cue" role="status">
                  <small>
                    <Volume2 aria-hidden="true" />
                    From your family
                  </small>
                  <p>{cue}</p>
                </div>
              )}
            </div>
            <Button
              className="camera-action"
              onClick={recognize}
              disabled={thinking || !ready}
            >
              {thinking || !ready ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <ScanFace aria-hidden="true" />
              )}
              {thinking
                ? "One little moment…"
                : !ready
                  ? "Getting ready…"
                  : "Who is this?"}
            </Button>
            {quiet ? (
              <p className="wearer-quiet" role="status">
                No familiar face this time.
                <br />
                <span className="muted">Kin will stay quiet.</span>
              </p>
            ) : (
              <p className="camera-help">
                <Headphones
                  size={16}
                  style={{
                    display: "inline",
                    verticalAlign: "middle",
                    marginRight: 7,
                  }}
                  aria-hidden="true"
                />
                Keep sound on, or connect your headphones.
              </p>
            )}
          </>
        )}
        {error && (
          <div className="stack" style={{ width: "100%", marginTop: 20 }}>
            <p className="notice notice-error" role="alert">
              {error}
            </p>
            <Button variant="outline" onClick={start} disabled={starting}>
              <RotateCcw aria-hidden="true" />
              Try camera again
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
