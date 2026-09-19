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
  cueText,
  latencyMs,
  silenceReason,
}: {
  gate?: GateResult | null;
  running: boolean;
  cueText?: string | null;
  latencyMs?: number | null;
  silenceReason?: string | null;
}) {
  const g = CONFIG.gate;
  return (
    <div>
      <h2 className="text-xl uppercase tracking-widest text-white/50 mb-4">
        Gatekeeper
      </h2>
      {SIGNALS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-3 mb-2">
          <span className="w-8 text-2xl font-bold text-white/80">{key}</span>
          <div className="flex-1 h-3 rounded bg-white/10 overflow-hidden">
            <div
              className="h-full bg-white/70 transition-all duration-500"
              style={{ width: `${Math.round((gate?.[key] ?? 0) * 100)}%` }}
            />
          </div>
          <span className="w-14 text-right text-white/60 tabular-nums">
            {(gate?.[key] ?? 0).toFixed(2)}
          </span>
          <span className="w-28 text-xs text-white/40">{label}</span>
        </div>
      ))}
      <div className="mt-4 text-lg text-white/70 font-mono">
        C = {g.wV}·V + {g.wR}·R + {g.wA}·A + {g.wS}·S - {g.wX}·X
      </div>
      <div className="text-2xl font-mono text-white">
        C = {(gate?.C ?? 0).toFixed(3)}{" "}
        <span className="text-white/50">/ threshold {g.threshold}</span>
      </div>
      <div className="mt-5">
        {running ? (
          <span className="text-3xl font-bold text-white/60 kin-pulse inline-block">
            LISTENING
          </span>
        ) : gate?.decision === "speak" ? (
          <span className="text-4xl font-bold text-emerald-400">SPEAK</span>
        ) : gate ? (
          <span className="text-4xl font-bold text-white/40 border-2 border-white/30 rounded-xl px-4 py-1 inline-block">
            SILENT
          </span>
        ) : (
          <span className="text-2xl text-white/30">idle</span>
        )}
      </div>
      {gate?.decision === "silent" && (silenceReason || gate.reason) && (
        <div className="mt-2 text-xl text-white/60">
          reason: {silenceReason ?? gate.reason}
        </div>
      )}
      {cueText && (
        <div className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-2xl text-white">
          “{cueText}”
        </div>
      )}
      {latencyMs != null && (
        <div className="mt-3 text-white/40">{latencyMs} ms end to end</div>
      )}
    </div>
  );
}
