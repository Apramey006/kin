//! P0 human-story support; canonical recognition is supplied by the trusted server.
use serde::{Deserialize, Serialize};
use crate::gate::{Claim, Evidence, FaceOutcome, KeeperResult};
use crate::config::{FACE, RETRIEVAL};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keeper { pub relative_id: String, pub name: String, pub color: String }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source { #[serde(rename = "type")] pub kind: String, pub caption: Option<String> }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Span { pub start: usize, pub end: usize }
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fact {
    pub id: String, pub subject_node_id: String, pub text: String,
    pub contributor_id: String, pub memory_id: String, pub source_span: Option<Span>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredMemory {
    pub id: String, pub contributor_id: String, pub transcript: Option<String>,
    pub source: Option<Source>, #[serde(default)] pub verified_facts: Vec<Fact>, pub similarity: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeeperInput { pub face: FaceOutcome, pub subject_label: String, pub memories: Vec<ScoredMemory> }
pub fn face_score(distance: f64) -> f64 { ((FACE.v_zero_distance-distance)/FACE.v_window).clamp(0.0,1.0) }
pub fn sim_score(similarity: f64) -> f64 { ((similarity-RETRIEVAL.sim_floor)/RETRIEVAL.sim_window).clamp(0.0,1.0) }
fn word_boundary(c: char) -> bool { !(c.is_ascii_alphanumeric() || c == '_') }
fn phrase(text: &str, needle: &str) -> bool {
    text.match_indices(needle).any(|(i, _)| (i == 0 || text[..i].chars().next_back().is_some_and(word_boundary)) &&
        (i+needle.len() == text.len() || text[i+needle.len()..].chars().next().is_some_and(word_boundary)))
}
fn identity_only(text: &str) -> bool {
    let lower = text.trim().to_lowercase();
    let tokens: Vec<_> = lower.split_whitespace().collect();
    let starts = |a: &str, b: &str| tokens.first() == Some(&a) && tokens.get(1).is_some_and(|w|
        w.strip_prefix(b).is_some_and(|tail| tail.is_empty() || tail.chars().next().is_some_and(word_boundary)));
    ["this","that","here"].iter().any(|a| starts(a,"is") || starts(a,"was")) ||
        starts("photo","of") || starts("picture","of") ||
        (tokens.first() == Some(&"a") && identity_only(&tokens[1..].join(" ")))
}
fn facts<'a>(m: &'a ScoredMemory, subject: &str) -> Vec<&'a Fact> {
    let Some(source) = &m.source else { return vec![] };
    if source.kind != "human" { return vec![]; }
    let literal = m.transcript.as_deref().filter(|t| !t.is_empty()).or(source.caption.as_deref()).unwrap_or("");
    m.verified_facts.iter().filter(|f| f.subject_node_id == subject && f.memory_id == m.id &&
        f.contributor_id == m.contributor_id && f.text.split_whitespace().count() >= 4 &&
        !identity_only(&f.text) && literal.contains(&f.text) &&
        f.source_span.as_ref().is_none_or(|span| {
            let units: Vec<u16> = literal.encode_utf16().collect();
            units.get(span.start..span.end).and_then(|s| String::from_utf16(s).ok()).as_deref() == Some(&f.text)
        })).collect()
}
pub fn build_keeper_result(keeper: &Keeper, input: &KeeperInput) -> KeeperResult {
    let mut result = KeeperResult { keeper_id: keeper.relative_id.clone(), claim: None, memory_ids: vec![],
        v: 0.0, r: 0.0, reason: "No meaningful human story linked to this subject".into(), support: "abstains".into(), evidence: vec![] };
    let FaceOutcome::Matched { subject_node_id: subject, v, .. } = &input.face else { return result };
    let mut own: Vec<_> = input.memories.iter().filter(|m| m.contributor_id == keeper.relative_id &&
        m.similarity.is_finite() && !facts(m,subject).is_empty()).collect();
    own.sort_by(|a,b| b.similarity.total_cmp(&a.similarity));
    own.truncate(RETRIEVAL.max_subject_memories);
    if own.is_empty() { return result; }
    let disputed = own.iter().any(|m| facts(m,subject).iter().any(|f| {
        let lower = f.text.to_lowercase();
        ["never","incorrect","mistaken","did not","didn't","was not","wasn't","not true","not actually"]
            .iter().any(|p| phrase(&lower,p))
    }));
    result.claim = Some(Claim { subject_node_id: subject.clone(), label: input.subject_label.clone() });
    result.memory_ids = own.iter().map(|m| m.id.clone()).collect(); result.v = *v; result.r = sim_score(own[0].similarity);
    result.support = if disputed { "contradicts" } else { "supports" }.into();
    result.reason = if disputed { "Human evidence contains an explicit denial; review before recall" }
        else { "Contributor's human story supports the matched subject" }.into();
    result.evidence = own.iter().map(|m| Evidence { memory_id: m.id.clone(), contributor_id: m.contributor_id.clone(),
        subject_node_id: subject.clone(), source: "human".into(), supported_facts: facts(m,subject).iter().map(|f| f.text.clone()).collect() }).collect();
    result
}
