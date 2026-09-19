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
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-2xl font-semibold" style={{ color }}>
          {name}
        </span>
        <span className="text-lg text-white/70">
          {busy && !result
            ? "searching..."
            : result
              ? result.claim
                ? result.claim.label
                : "no reliable memory"
              : "waiting"}
        </span>
      </div>
      <div className="h-4 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round(score * 100)}%`, background: color }}
        />
      </div>
      {result && (
        <div className="mt-1 text-sm text-white/50 flex justify-between">
          <span>
            v {result.v.toFixed(2)} · r {result.r.toFixed(2)} · {result.reason}
          </span>
          <span>{result.memoryIds.length} memories</span>
        </div>
      )}
    </div>
  );
}
