import { CONFIG, SILENCE_REASONS } from "./config";
import type { GateResult, KeeperResult } from "./types";

/**
 * Extra evidence the pure gate needs that is not on KeeperResult itself.
 * All three are plain lookups so the gate stays fully unit-testable.
 */
export interface GateInfo {
  /** nodeId -> whether the node has at least one provenance row */
  subjectProvenance: Record<string, boolean>;
  /** memoryId -> kind */
  memoryKinds: Record<string, string>;
  /** memoryId -> contributor_id (who owns the memory) */
  memoryOwners: Record<string, string>;
}

export function evaluateGate(
  results: KeeperResult[],
  info: GateInfo
): GateResult {
  const { gate } = CONFIG;
  const threshold = gate.threshold;

  const claiming = results.filter((r) => r.claim !== null);
  const base: Omit<GateResult, "decision" | "reason"> = {
    V: 0,
    R: 0,
    A: 0,
    S: 0,
    X: 0,
    C: 0,
    threshold,
    subjectNodeId: null,
    agreeingKeeperIds: [],
    citedMemoryIds: [],
  };

  const silent = (
    reason: string,
    over: Partial<GateResult> = {}
  ): GateResult => ({ ...base, ...over, decision: "silent", reason });

  if (claiming.length === 0) {
    return silent(SILENCE_REASONS.noClaims);
  }

  // Group claims by subject; top subject = most claims, tie -> highest summed v+r.
  const bySubject = new Map<string, KeeperResult[]>();
  for (const r of claiming) {
    const key = r.claim!.subjectNodeId;
    bySubject.set(key, [...(bySubject.get(key) ?? []), r]);
  }
  const groups = [...bySubject.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    const sum = (rs: KeeperResult[]) => rs.reduce((s, r) => s + r.v + r.r, 0);
    return sum(b[1]) - sum(a[1]);
  });
  const [topSubject, agreeing] = groups[0];
  const disagreeing = groups.slice(1).flatMap(([, rs]) => rs);

  const agree = agreeing.length;
  const disagree = disagreeing.length;

  const V = Math.max(...agreeing.map((r) => r.v));
  const R = agreeing.reduce((s, r) => s + r.r, 0) / agree;
  const A =
    agree === 1 && disagree === 0
      ? gate.singleClaimantAgreement
      : agree / (agree + disagree);
  const X = disagree / (agree + disagree);

  const citedMemoryIds = agreeing.flatMap((r) => r.memoryIds);
  const everyCitesOwn = agreeing.every(
    (r) =>
      r.memoryIds.length > 0 &&
      r.memoryIds.every((id) => info.memoryOwners[id] === r.keeperId)
  );
  const subjectHasProvenance = info.subjectProvenance[topSubject] === true;
  const hasVisual =
    agreeing.some((r) => r.v > 0) ||
    citedMemoryIds.some((id) => info.memoryKinds[id] === "photo");
  const S = everyCitesOwn && subjectHasProvenance ? (hasVisual ? 1 : 0.5) : 0;

  const C =
    gate.wV * V + gate.wR * R + gate.wA * A + gate.wS * S - gate.wX * X;

  const over = {
    V,
    R,
    A,
    S,
    X,
    C,
    subjectNodeId: topSubject,
    agreeingKeeperIds: agreeing.map((r) => r.keeperId),
    citedMemoryIds,
  };

  if (X > 0) return silent(SILENCE_REASONS.disagree, over);
  if (S === 0) return silent(SILENCE_REASONS.noProvenance, over);
  if (new Set(agreeing.map((r) => r.keeperId)).size < gate.minKeepers) {
    return silent(SILENCE_REASONS.needAgreement, over);
  }
  if (agreeing.some((r) => !Number.isFinite(r.v) || r.v < (CONFIG.face.vZeroDistance - CONFIG.face.maxDistance) / CONFIG.face.vWindow)) {
    return silent(SILENCE_REASONS.weakFace, over);
  }
  if (C >= threshold) {
    return { ...base, ...over, decision: "speak", reason: "speak" };
  }
  return silent(SILENCE_REASONS.belowThreshold, over);
}
