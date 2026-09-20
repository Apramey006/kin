import { DEMO_FAMILY_ID } from "./demo";

export const CONFIG = {
  familyId: process.env.KIN_FAMILY_ID ?? DEMO_FAMILY_ID,
  storageBucket: "media",
  snapshotMaxPx: 1024,
  storyMaxSeconds: 60,

  face: {
    // v = clamp((vZeroDistance - d) / vWindow, 0, 1)
    vFullDistance: 0.35,
    vZeroDistance: 0.6,
    vWindow: 0.25,
    matchK: 5,
    minConfidence: 0.5,
    strongMatchV: 0.9,
  },

  retrieval: {
    // r = clamp((bestSim - simFloor) / simWindow, 0, 1)
    simFloor: 0.2,
    simWindow: 0.4,
    topK: 5,
    claimMinR: 0.5,
    maxSubjectMemories: 3,
  },

  gate: {
    wV: 0.35,
    wR: 0.25,
    wA: 0.2,
    wS: 0.15,
    wX: 0.25,
    threshold: gateThreshold(),
    singleClaimantAgreement: 0.75,
  },

  cue: {
    maxWords: 30,
    contextMaxWords: 18,
  },

  timeouts: {
    visionMs: 6000,
    extractionMs: 10000,
    ttsMs: 5000,
  },

  wearerCueDisplayMs: 8000,

  maxUploadBytes: 15 * 1024 * 1024,
} as const;

function gateThreshold(): number {
  const value = Number(process.env.KIN_GATE_THRESHOLD || "0.85");
  if (!Number.isFinite(value) || value < 0.85 || value > 1) {
    throw new Error("KIN_GATE_THRESHOLD must be between 0.85 and 1");
  }
  return value;
}

export const SILENCE_REASONS = {
  noClaims: "no reliable memory",
  disagree: "keepers disagree",
  noProvenance: "no provenance",
  belowThreshold: "below threshold",
} as const;
