export const CONFIG = {
  familyId: process.env.NEXT_PUBLIC_KIN_FAMILY_ID || "demo",
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
    maxDistance: 0.425,
    ambiguityMargin: 0.06,
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
    threshold: 0.8,
    singleClaimantAgreement: 0.75,
    minKeepers: 2,
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

export const SILENCE_REASONS = {
  noClaims: "no reliable memory",
  disagree: "keepers disagree",
  noProvenance: "no provenance",
  belowThreshold: "below threshold",
  needAgreement: "need two relatives with matching enrolled photos",
  weakFace: "no strong face match",
} as const;
