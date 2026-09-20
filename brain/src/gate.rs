//! Conservative P0 gate. Conformance fixtures are generated from lib/gate.ts.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Claim { pub subject_node_id: String, pub label: String }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub memory_id: String, pub contributor_id: String, pub subject_node_id: String,
    pub source: String, pub supported_facts: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperResult {
    pub keeper_id: String, pub claim: Option<Claim>, pub memory_ids: Vec<String>,
    pub v: f64, pub r: f64, pub reason: String, pub support: String, pub evidence: Vec<Evidence>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum FaceOutcome {
    Matched {
        #[serde(rename = "subjectNodeId")] subject_node_id: String,
        model: String,
        #[serde(rename = "enrollmentIds")] enrollment_ids: Vec<String>,
        distance: f64, v: f64,
    },
    NoFace { model: String }, Unknown { model: String },
    Ambiguous { model: String }, Unavailable { model: String },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GateInfo {
    pub face: FaceOutcome,
    #[serde(default)] pub provider_failure: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GateResult {
    #[serde(rename = "V")] pub v: f64,
    #[serde(rename = "R")] pub r: f64,
    #[serde(rename = "A")] pub a: f64,
    #[serde(rename = "S")] pub s: f64,
    #[serde(rename = "X")] pub x: f64,
    #[serde(rename = "C")] pub c: f64,
    pub threshold: f64, pub decision: String, pub reason: String,
    pub subject_node_id: Option<String>, pub agreeing_keeper_ids: Vec<String>,
    pub cited_memory_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub reason_code: Option<String>,
}
impl GateResult {
    fn silent(mut self, code: &str, reason: &str) -> Self {
        self.decision = "silent".into(); self.reason_code = Some(code.into()); self.reason = reason.into(); self
    }
}
pub fn evaluate_gate(results: &[KeeperResult], info: &GateInfo) -> GateResult {
    let configured = std::env::var("KIN_GATE_THRESHOLD").unwrap_or_default();
    let threshold = if configured.is_empty() { Some(crate::config::GATE.threshold) }
        else { configured.parse::<f64>().ok().filter(|v| v.is_finite() && (0.85..=1.0).contains(v)) };
    let mut g = GateResult { v: 0.0, r: 0.0, a: 0.0, s: 0.0, x: 0.0, c: 0.0,
        threshold: threshold.unwrap_or(1.0), decision: "silent".into(), reason: String::new(),
        subject_node_id: None, agreeing_keeper_ids: vec![], cited_memory_ids: vec![], reason_code: None };
    if threshold.is_none() { return g.silent("provider_failure", "Invalid evidence scores"); }
    if info.provider_failure || matches!(info.face, FaceOutcome::Unavailable { .. }) {
        return g.silent("provider_failure", "Required service unavailable");
    }
    let (subject, v) = match &info.face {
        FaceOutcome::NoFace { .. } => return g.silent("no_face", "No face detected"),
        FaceOutcome::Unknown { .. } => return g.silent("unknown_face", "No eligible enrolled face matched"),
        FaceOutcome::Ambiguous { .. } => return g.silent("ambiguous_face", "Face match is ambiguous"),
        FaceOutcome::Unavailable { .. } => return g.silent("provider_failure", "Required service unavailable"),
        FaceOutcome::Matched { subject_node_id, v, .. } => (subject_node_id, *v),
    };
    g.subject_node_id = Some(subject.clone()); g.v = v;
    let has_subject = |r: &&KeeperResult| r.claim.as_ref().is_some_and(|c| &c.subject_node_id == subject);
    let supporting: Vec<_> = results.iter().filter(|r| r.support == "supports" && has_subject(r)).collect();
    let contradicting = results.iter().filter(|r| r.support == "contradicts" || (r.support == "supports" && !has_subject(r))).count();
    g.x = contradicting as f64 / (contradicting + supporting.len()).max(1) as f64;
    if contradicting > 0 { return g.silent("contradiction", "Keepers disagree"); }
    if supporting.iter().any(|r| r.evidence.is_empty() || r.memory_ids.is_empty() ||
        r.memory_ids.iter().any(|id| !r.evidence.iter().any(|e| &e.memory_id == id)) ||
        r.evidence.iter().any(|e| e.source != "human" || e.contributor_id != r.keeper_id ||
            &e.subject_node_id != subject || !r.memory_ids.contains(&e.memory_id) ||
            e.supported_facts.is_empty() || e.supported_facts.iter().any(|f| f.trim().is_empty()))) {
        return g.silent("no_provenance", "Supporting claim has no valid human provenance");
    }
    // JS Map semantics: preserve initial position, use the last value for a duplicate.
    let mut unique: Vec<&KeeperResult> = vec![];
    for r in supporting {
        if let Some(i) = unique.iter().position(|other| other.keeper_id == r.keeper_id) { unique[i] = r; }
        else { unique.push(r); }
    }
    g.agreeing_keeper_ids = unique.iter().map(|r| r.keeper_id.clone()).collect();
    for id in unique.iter().flat_map(|r| &r.memory_ids) {
        if !g.cited_memory_ids.contains(id) { g.cited_memory_ids.push(id.clone()); }
    }
    if !unique.is_empty() { g.r = unique.iter().map(|r| r.r).sum::<f64>() / unique.len() as f64; g.s = 1.0; }
    if unique.len() >= 2 { g.a = 1.0; }
    g.c = 0.35*g.v + 0.25*g.r + 0.20*g.a + 0.15*g.s - 0.25*g.x;
    if unique.len() < 2 { return g.silent("insufficient_evidence", "Two distinct contributors with human stories are required"); }
    if ![g.v,g.r,g.a,g.s,g.x,g.c].iter().all(|n| n.is_finite()) ||
        unique.iter().any(|r| !(0.0..=1.0).contains(&r.r)) || !(0.0..=1.0).contains(&g.v) {
        return g.silent("provider_failure", "Invalid evidence scores");
    }
    if g.c < g.threshold { return g.silent("below_threshold", "Evidence is below the recall threshold"); }
    g.decision = "speak".into(); g.reason = "Verified independent human evidence".into(); g
}
