"use client";

import type { KeeperResult } from "@/lib/types";

export function KeeperBar({
  name,
  color,
  result,
  busy,
}: {
  name: string;
  color: string;
  result?: KeeperResult;
  busy: boolean;
}) {
  const score = result ? Math.max(result.v, result.r) : 0;
  const searching = busy && !result;
  return (
    <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span
          className="flex min-w-0 items-center gap-2 text-lg font-semibold"
          style={{ color }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden
          />
          <span className="truncate">{name}</span>
        </span>
        <span
          className={`shrink-0 text-right text-sm ${
            searching ? "kin-pulse text-white/50" : "text-white/65"
          }`}
        >
          {searching
            ? "searching…"
            : result
              ? result.claim
                ? result.claim.label
                : "no reliable memory"
              : "waiting"}
        </span>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.round(score * 100)}%`, background: color }}
        />
      </div>
      {result && <p className="mt-2 text-sm font-semibold uppercase">{result.support ?? "abstains"}</p>}
      {result && (
        <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-white/45">
          <span className="min-w-0 truncate">
            <span className="font-mono tabular-nums">v {result.v.toFixed(2)}</span>
            {" · "}
            <span className="font-mono tabular-nums">r {result.r.toFixed(2)}</span>
            {" · "}
            {result.reason}
          </span>
          <span className="shrink-0">{result.memoryIds.length} memories</span>
        </div>
      )}
      {result?.evidence?.map((evidence) => <div key={evidence.memoryId} className="mt-2 text-sm text-white/70"><p className="font-mono text-xs">Human memory {evidence.memoryId.slice(0, 8)}</p><ul>{evidence.supportedFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul></div>)}
      {result && result.memoryIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.memoryIds.slice(0, 4).map((id) => (
            <span
              key={id}
              className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-white/55"
              style={{ borderLeft: `2px solid ${color}` }}
            >
              {id.slice(0, 6)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
