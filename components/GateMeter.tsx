"use client";

import { CONFIG } from "@/lib/config";
import type { GateResult } from "@/lib/types";

const SIGNALS: { key: "V" | "R" | "A" | "S" | "X"; label: string }[] = [
  { key: "V", label: "Visual" },
  { key: "R", label: "Retrieval" },
  { key: "A", label: "Agreement" },
  { key: "S", label: "Provenance" },
  { key: "X", label: "Disagreement" },
];

export function GateMeter({
  gate,
  running,
  status,
  cueText,
  latencyMs,
  silenceReason,
}: {
  gate?: GateResult | null;
  running: boolean;
  status?: "running" | "speak" | "silent";
  cueText?: string | null;
  latencyMs?: number | null;
  silenceReason?: string | null;
}) {
  const g = CONFIG.gate;
  const confidence = gate?.C ?? 0;
  const decision = status === "speak" || status === "silent" ? status : gate?.decision;
  const threshold = gate?.threshold ?? g.threshold;
  const passes = decision === "speak" && confidence >= threshold;
  return (
    <div>
      <h2 className="panel-label mb-4">Gatekeeper</h2>

      <div className="space-y-2.5">
        {SIGNALS.map(({ key, label }) => {
          const value = gate?.[key] ?? 0;
          const penalty = key === "X";
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-5 text-lg font-bold tabular-nums text-white/70">
                {key}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    penalty ? "bg-amber-400/80" : "bg-white/75"
                  }`}
                  style={{ width: `${Math.round(value * 100)}%` }}
                />
              </div>
              <span className="w-11 text-right font-mono text-sm tabular-nums text-white/60">
                {value.toFixed(2)}
              </span>
              <span className="w-24 text-xs text-white/35">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <div className="font-mono text-xs text-white/45">
          C = {g.wV}·V + {g.wR}·R + {g.wA}·A + {g.wS}·S − {g.wX}·X
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`font-mono text-3xl font-semibold tabular-nums ${
              passes ? "text-emerald-300" : "text-white"
            }`}
          >
            {confidence.toFixed(3)}
          </span>
          <span className="font-mono text-sm text-white/40">
            / threshold {threshold}
          </span>
        </div>
        {/* Confidence against the threshold, marked at the gate. */}
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              passes ? "bg-emerald-400" : "bg-white/45"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, confidence * 100))}%` }}
          />
          <span
            aria-hidden
            className="absolute top-0 h-full w-px bg-white/70"
            style={{ left: `${threshold * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-5" aria-live="polite">
        {running ? (
          <span className="kin-pulse inline-block text-2xl font-bold tracking-wide text-white/60">
            LISTENING
          </span>
        ) : decision === "speak" ? (
          <span className="inline-block rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-1.5 text-3xl font-bold tracking-wide text-emerald-300">
            SPEAK
          </span>
        ) : decision === "silent" ? (
          <span className="inline-block rounded-xl border border-white/25 px-4 py-1.5 text-3xl font-bold tracking-wide text-white/40">
            SILENT
          </span>
        ) : (
          <span className="text-xl text-white/25">idle</span>
        )}
      </div>

      {decision === "silent" && (silenceReason || gate?.reason) && (
        <p className="mt-2 text-base text-white/55">
          <span className="text-white/35">reason: </span>
          {silenceReason ?? gate?.reason}
        </p>
      )}

      {decision === "speak" && cueText && (
        <blockquote className="animate-fade-up mt-4 rounded-xl border-l-2 border-emerald-400/60 bg-white/[0.07] px-4 py-3 text-xl leading-snug text-white">
          “{cueText}”
        </blockquote>
      )}

      {latencyMs != null && (
        <p className="mt-3 font-mono text-xs text-white/35">
          {latencyMs} ms end to end
        </p>
      )}
    </div>
  );
}
