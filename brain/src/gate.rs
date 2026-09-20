//! The Gatekeeper: decides whether the family's evidence agrees strongly
//! enough to say anything at all.
//!
//! Port of lib/gate.ts. Pure: no I/O, no clock, no randomness. Behavior is
//! pinned by conformance/gate-fixtures.json, which was generated from the
//! TypeScript original.
//!
//! C = 0.35V + 0.25R + 0.20A + 0.15S - 0.25X, SPEAK at C >= 0.80.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::config::{SilenceReason, GATE};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    #[serde(rename = "subjectNodeId")]
    pub subject_node_id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeeperResult {
    #[serde(rename = "keeperId")]
    pub keeper_id: String,
    pub claim: Option<Claim>,
    #[serde(rename = "memoryIds")]
    pub memory_ids: Vec<String>,
    pub v: f64,
    pub r: f64,
    #[serde(default)]
    pub reason: String,
}

/// Evidence the pure gate needs that does not live on KeeperResult.
/// All three are plain lookups so the gate stays fully testable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateInfo {
    /// node id -> whether the node has at least one provenance row
    #[serde(rename = "subjectProvenance")]
    pub subject_provenance: HashMap<String, bool>,
    /// memory id -> kind
    #[serde(rename = "memoryKinds")]
    pub memory_kinds: HashMap<String, String>,
    /// memory id -> contributor who owns the memory
    #[serde(rename = "memoryOwners")]
    pub memory_owners: HashMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Decision {
    Speak,
    Silent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateResult {
    #[serde(rename = "V")]
    pub v: f64,
    #[serde(rename = "R")]
    pub r: f64,
    #[serde(rename = "A")]
    pub a: f64,
    #[serde(rename = "S")]
    pub s: f64,
    #[serde(rename = "X")]
    pub x: f64,
    #[serde(rename = "C")]
    pub c: f64,
    pub threshold: f64,
    pub decision: Decision,
    pub reason: String,
    #[serde(rename = "subjectNodeId")]
    pub subject_node_id: Option<String>,
    #[serde(rename = "agreeingKeeperIds")]
    pub agreeing_keeper_ids: Vec<String>,
    #[serde(rename = "citedMemoryIds")]
    pub cited_memory_ids: Vec<String>,
}

impl GateResult {
    /// The zeroed result used for every silence that exits before scoring.
    fn empty(reason: SilenceReason) -> Self {
        GateResult {
            v: 0.0,
            r: 0.0,
            a: 0.0,
            s: 0.0,
            x: 0.0,
            c: 0.0,
            threshold: GATE.threshold,
            decision: Decision::Silent,
            reason: reason.as_str().to_string(),
            subject_node_id: None,
            agreeing_keeper_ids: Vec::new(),
            cited_memory_ids: Vec::new(),
        }
    }
}

/// Scored signals for the winning subject, before the decision is made.
struct Scored {
    v: f64,
    r: f64,
    a: f64,
    s: f64,
    x: f64,
    c: f64,
    subject_node_id: String,
    agreeing_keeper_ids: Vec<String>,
    cited_memory_ids: Vec<String>,
}

impl Scored {
    fn into_result(self, decision: Decision, reason: String) -> GateResult {
        GateResult {
            v: self.v,
            r: self.r,
            a: self.a,
            s: self.s,
            x: self.x,
            c: self.c,
            threshold: GATE.threshold,
            decision,
            reason,
            subject_node_id: Some(self.subject_node_id),
            agreeing_keeper_ids: self.agreeing_keeper_ids,
            cited_memory_ids: self.cited_memory_ids,
        }
    }
}

pub fn evaluate_gate(results: &[KeeperResult], info: &GateInfo) -> GateResult {
    let claiming: Vec<&KeeperResult> = results.iter().filter(|r| r.claim.is_some()).collect();
    if claiming.is_empty() {
        return GateResult::empty(SilenceReason::NoClaims);
    }

    // Group claims by subject; top subject = most claims, tie -> highest summed v+r.
    // Insertion order is preserved so ties beyond that resolve as they do in JS.
    let mut order: Vec<String> = Vec::new();
    let mut by_subject: HashMap<String, Vec<&KeeperResult>> = HashMap::new();
    for r in &claiming {
        let key = r.claim.as_ref().expect("filtered to claimants").subject_node_id.clone();
        if !by_subject.contains_key(&key) {
            order.push(key.clone());
        }
        by_subject.entry(key).or_default().push(r);
    }

    let sum_vr = |rs: &Vec<&KeeperResult>| -> f64 { rs.iter().map(|r| r.v + r.r).sum() };
    let mut groups: Vec<(String, Vec<&KeeperResult>)> = order
        .into_iter()
        .map(|k| {
            let rs = by_subject.remove(&k).expect("key came from insertion order");
            (k, rs)
        })
        .collect();
    groups.sort_by(|a, b| {
        b.1.len()
            .cmp(&a.1.len())
            .then_with(|| sum_vr(&b.1).total_cmp(&sum_vr(&a.1)))
    });

    let (top_subject, agreeing) = groups.first().expect("at least one claimant");
    let disagreeing: Vec<&KeeperResult> =
        groups.iter().skip(1).flat_map(|(_, rs)| rs.iter().copied()).collect();

    let agree = agreeing.len() as f64;
    let disagree = disagreeing.len() as f64;

    let v = agreeing.iter().map(|r| r.v).fold(f64::NEG_INFINITY, f64::max);
    let r_signal = agreeing.iter().map(|r| r.r).sum::<f64>() / agree;
    let a = if agreeing.len() == 1 && disagreeing.is_empty() {
        GATE.single_claimant_agreement
    } else {
        agree / (agree + disagree)
    };
    let x = disagree / (agree + disagree);

    let cited_memory_ids: Vec<String> =
        agreeing.iter().flat_map(|r| r.memory_ids.iter().cloned()).collect();

    // S guards provenance: every agreeing keeper must cite a memory it owns,
    // and the subject itself must be backed by a provenance row.
    let every_cites_own = agreeing.iter().all(|r| {
        !r.memory_ids.is_empty()
            && r.memory_ids
                .iter()
                .all(|id| info.memory_owners.get(id) == Some(&r.keeper_id))
    });
    let subject_has_provenance = info.subject_provenance.get(top_subject) == Some(&true);
    let has_visual = agreeing.iter().any(|r| r.v > 0.0)
        || cited_memory_ids
            .iter()
            .any(|id| info.memory_kinds.get(id).map(String::as_str) == Some("photo"));
    let s = if every_cites_own && subject_has_provenance {
        if has_visual {
            1.0
        } else {
            0.5
        }
    } else {
        0.0
    };

    let c = GATE.w_v * v + GATE.w_r * r_signal + GATE.w_a * a + GATE.w_s * s - GATE.w_x * x;

    let scored = Scored {
        v,
        r: r_signal,
        a,
        s,
        x,
        c,
        subject_node_id: top_subject.clone(),
        agreeing_keeper_ids: agreeing.iter().map(|r| r.keeper_id.clone()).collect(),
        cited_memory_ids,
    };

    // Any dissent at all is an absolute veto, checked before the threshold:
    // two strong agreeing keepers still fall silent against one weak dissenter.
    if x > 0.0 {
        let reason = SilenceReason::Disagree.as_str().to_string();
        return scored.into_result(Decision::Silent, reason);
    }
    if s == 0.0 {
        let reason = SilenceReason::NoProvenance.as_str().to_string();
        return scored.into_result(Decision::Silent, reason);
    }
    if c >= GATE.threshold {
        return scored.into_result(Decision::Speak, "speak".to_string());
    }
    let reason = SilenceReason::BelowThreshold.as_str().to_string();
    scored.into_result(Decision::Silent, reason)
}
