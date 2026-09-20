import { CONFIG } from "./config";
import type { FaceOutcome, GateResult, KeeperResult, SilenceReasonCode } from "./types";

export interface GateInfo {
  face: FaceOutcome;
  providerFailure?: boolean;
}

/** Pure policy. C is a heuristic, never an identity probability. */
export function evaluateGate(results: KeeperResult[], info: GateInfo): GateResult {
  const gate: GateResult = {
    V: 0, R: 0, A: 0, S: 0, X: 0, C: 0, threshold: CONFIG.gate.threshold,
    decision: "silent", reason: "", subjectNodeId: null,
    agreeingKeeperIds: [], citedMemoryIds: [],
  };
  const silent = (reasonCode: SilenceReasonCode, reason: string): GateResult =>
    ({ ...gate, decision: "silent", reasonCode, reason });
  if (info.providerFailure || info.face.status === "unavailable") return silent("provider_failure", "Required service unavailable");
  if (info.face.status === "no_face") return silent("no_face", "No face detected");
  if (info.face.status === "unknown") return silent("unknown_face", "No eligible enrolled face matched");
  if (info.face.status === "ambiguous") return silent("ambiguous_face", "Face match is ambiguous");
  if (info.face.status !== "matched") return silent("provider_failure", "Invalid face result");
  const subject = info.face.subjectNodeId;
  gate.subjectNodeId = subject;
  gate.V = info.face.v;
  const contradicting = results.filter(r => r.support === "contradicts" ||
    (r.support === "supports" && r.claim?.subjectNodeId !== subject));
  const supporting = results.filter(r => r.support === "supports" && r.claim?.subjectNodeId === subject);
  gate.X = contradicting.length / Math.max(1, contradicting.length + supporting.length);
  if (contradicting.length) return silent("contradiction", "Keepers disagree");
  // Fail closed if any claimed supporting record lacks scoped, literal human facts.
  if (supporting.some(r => !r.evidence.length || !r.memoryIds.length ||
      r.memoryIds.some(id => !r.evidence.some(e => e.memoryId === id)) ||
      r.evidence.some(e => e.source !== "human" || e.contributorId !== r.keeperId ||
        e.subjectNodeId !== subject || !r.memoryIds.includes(e.memoryId) ||
        !e.supportedFacts.length || e.supportedFacts.some(f => !f.trim())))) {
    return silent("no_provenance", "Supporting claim has no valid human provenance");
  }
  // Count contributors, not enrollments, memories, or duplicated Keeper results.
  const unique = [...new Map(supporting.map(r => [r.keeperId, r])).values()];
  gate.agreeingKeeperIds = unique.map(r => r.keeperId);
  gate.citedMemoryIds = [...new Set(unique.flatMap(r => r.memoryIds))];
  gate.R = unique.length ? unique.reduce((sum, r) => sum + r.r, 0) / unique.length : 0;
  gate.A = unique.length >= 2 ? 1 : 0;
  gate.S = unique.length ? 1 : 0;
  gate.C = .35 * gate.V + .25 * gate.R + .20 * gate.A + .15 * gate.S - .25 * gate.X;
  if (unique.length < 2) return silent("insufficient_evidence", "Two distinct contributors with human stories are required");
  if (![gate.V, gate.R, gate.A, gate.S, gate.X, gate.C].every(Number.isFinite) ||
      unique.some(r => r.r < 0 || r.r > 1) || gate.V < 0 || gate.V > 1) {
    return silent("provider_failure", "Invalid evidence scores");
  }
  if (gate.C < gate.threshold) return silent("below_threshold", "Evidence is below the recall threshold");
  return { ...gate, decision: "speak", reason: "Verified independent human evidence" };
}
