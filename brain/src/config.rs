//! Mirrors lib/config.ts. These constants are the gate's contract; the
//! conformance fixtures are generated against exactly these values.

pub struct GateConfig {
    pub w_v: f64,
    pub w_r: f64,
    pub w_a: f64,
    pub w_s: f64,
    pub w_x: f64,
    pub threshold: f64,
    pub single_claimant_agreement: f64,
}

pub const GATE: GateConfig = GateConfig {
    w_v: 0.35,
    w_r: 0.25,
    w_a: 0.20,
    w_s: 0.15,
    w_x: 0.25,
    threshold: 0.80,
    single_claimant_agreement: 0.75,
};

/// Why the gate stayed silent. Kept as a closed set so a new silence path
/// cannot be added without naming it here.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SilenceReason {
    NoClaims,
    Disagree,
    NoProvenance,
    BelowThreshold,
}

impl SilenceReason {
    /// Wire strings are load-bearing: they match lib/config.ts SILENCE_REASONS
    /// and appear in the conformance fixtures.
    pub fn as_str(self) -> &'static str {
        match self {
            SilenceReason::NoClaims => "no reliable memory",
            SilenceReason::Disagree => "keepers disagree",
            SilenceReason::NoProvenance => "no provenance",
            SilenceReason::BelowThreshold => "below threshold",
        }
    }
}

pub struct FaceConfig {
    pub v_full_distance: f64,
    pub v_zero_distance: f64,
    pub v_window: f64,
    pub match_k: usize,
    pub min_confidence: f64,
    pub strong_match_v: f64,
}

pub const FACE: FaceConfig = FaceConfig {
    v_full_distance: 0.35,
    v_zero_distance: 0.6,
    v_window: 0.25,
    match_k: 5,
    min_confidence: 0.5,
    strong_match_v: 0.9,
};

pub struct RetrievalConfig {
    pub sim_floor: f64,
    pub sim_window: f64,
    pub top_k: usize,
    pub claim_min_r: f64,
    pub max_subject_memories: usize,
}

pub const RETRIEVAL: RetrievalConfig = RetrievalConfig {
    sim_floor: 0.2,
    sim_window: 0.4,
    top_k: 5,
    claim_min_r: 0.5,
    max_subject_memories: 3,
};
