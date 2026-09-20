//! A Keeper: one relative's agent, grounded only in memories that relative
//! contributed.
//!
//! Port of the pure half of lib/keepers.ts (`buildKeeperResult`). Behavior is
//! pinned by conformance/keeper-fixtures.json. The DB-backed retrieval that
//! assembles KeeperInput lives in `retrieval`.
//!
//! The ownership rule is the load-bearing one: a keeper may only ever claim
//! from, and cite, memories it owns. That is what makes agreement between two
//! keepers meaningful evidence rather than the same memory counted twice.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::config::{FACE, RETRIEVAL};
use crate::gate::{Claim, KeeperResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Keeper {
    #[serde(rename = "relativeId")]
    pub relative_id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaceMatch {
    pub person_node_id: String,
    pub contributor_id: String,
    pub memory_id: String,
    pub distance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredMemory {
    pub id: String,
    pub summary: String,
    pub similarity: f64,
}

/// Everything the pure keeper logic needs. The DB layer assembles this;
/// tests construct it directly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeeperInput {
    /// Face candidates, possibly including other relatives' rows (filtered here).
    #[serde(rename = "faceMatches")]
    pub face_matches: Vec<FaceMatch>,
    #[serde(rename = "nodeLabels")]
    pub node_labels: HashMap<String, String>,
    #[serde(rename = "nodeTypes")]
    pub node_types: HashMap<String, String>,
    /// memory id -> owner, used to guarantee keepers only cite their own.
    #[serde(rename = "memoryOwners")]
    pub memory_owners: HashMap<String, String>,
    /// This keeper's top semantic matches, sorted by similarity desc.
    pub memories: Vec<ScoredMemory>,
    #[serde(rename = "memoryNodeLinks")]
    pub memory_node_links: HashMap<String, Vec<String>>,
    /// This keeper's memories linked to the best face person.
    #[serde(rename = "personLinkedMemories")]
    pub person_linked_memories: Vec<ScoredMemory>,
}

fn clamp01(x: f64) -> f64 {
    x.clamp(0.0, 1.0)
}

/// v: how well the face matches, from descriptor distance.
pub fn face_score(distance: f64) -> f64 {
    clamp01((FACE.v_zero_distance - distance) / FACE.v_window)
}

/// r: how well the scene matches this keeper's memories, from similarity.
pub fn sim_score(similarity: f64) -> f64 {
    clamp01((similarity - RETRIEVAL.sim_floor) / RETRIEVAL.sim_window)
}

/// How the keeper arrived at its claim, or why it abstained. Carries the
/// numbers so the reason string is built in one place.
enum Basis {
    Face { distance: f64 },
    WeakFace { distance: f64 },
    Memory { similarity: f64 },
    MemoryNoSubject,
    Nothing,
}

impl Basis {
    fn reason(&self) -> String {
        match self {
            Basis::Face { distance } => format!("face match (d={:.2})", distance),
            Basis::WeakFace { distance } => format!("weak face match (d={:.2})", distance),
            Basis::Memory { similarity } => format!("memory match (sim={:.2})", similarity),
            Basis::MemoryNoSubject => "memory match but no linked subject".to_string(),
            Basis::Nothing => "no reliable memory".to_string(),
        }
    }
}

pub fn build_keeper_result(keeper: &Keeper, input: &KeeperInput) -> KeeperResult {
    let owns = |id: &str| input.memory_owners.get(id) == Some(&keeper.relative_id);

    // Face step: best (lowest) distance among this keeper's own enrollments.
    let best_face: Option<&FaceMatch> = input
        .face_matches
        .iter()
        .filter(|m| m.contributor_id == keeper.relative_id)
        .fold(None, |acc: Option<&FaceMatch>, m| match acc {
            Some(b) if b.distance <= m.distance => Some(b),
            _ => Some(m),
        });
    let v = best_face.map(|f| face_score(f.distance)).unwrap_or(0.0);

    // Memory step: semantic match over this keeper's own memories.
    let mut own_memories: Vec<&ScoredMemory> =
        input.memories.iter().filter(|m| owns(&m.id)).collect();
    own_memories.sort_by(|a, b| b.similarity.total_cmp(&a.similarity));
    let r = own_memories.first().map(|m| sim_score(m.similarity)).unwrap_or(0.0);

    // Claim: a live face match wins; otherwise a strong-enough memory whose
    // provenance points at a person or object.
    let (claim, basis) = match best_face {
        Some(face) if v > 0.0 => (
            Some(Claim {
                subject_node_id: face.person_node_id.clone(),
                label: input
                    .node_labels
                    .get(&face.person_node_id)
                    .cloned()
                    .unwrap_or_else(|| "someone".to_string()),
            }),
            Basis::Face { distance: face.distance },
        ),
        _ => {
            let top = own_memories.first();
            match top {
                Some(top) if r >= RETRIEVAL.claim_min_r => {
                    let linked = input
                        .memory_node_links
                        .get(&top.id)
                        .and_then(|ids| {
                            ids.iter().find(|nid| {
                                matches!(
                                    input.node_types.get(*nid).map(String::as_str),
                                    Some("person") | Some("object")
                                )
                            })
                        })
                        .cloned();
                    match linked {
                        Some(nid) => (
                            Some(Claim {
                                label: input
                                    .node_labels
                                    .get(&nid)
                                    .cloned()
                                    .unwrap_or_else(|| "something".to_string()),
                                subject_node_id: nid,
                            }),
                            Basis::Memory { similarity: top.similarity },
                        ),
                        None => (None, Basis::MemoryNoSubject),
                    }
                }
                _ => (
                    None,
                    match best_face {
                        Some(f) => Basis::WeakFace { distance: f.distance },
                        None => Basis::Nothing,
                    },
                ),
            }
        }
    };

    // Cited memories: the face's source memory plus up to N of this keeper's
    // memories linked to the claimed subject. Always this keeper's own, and
    // insertion-ordered to match the JS Set.
    let mut cited: Vec<String> = Vec::new();
    let push = |cited: &mut Vec<String>, id: &str| {
        if !cited.iter().any(|c| c == id) {
            cited.push(id.to_string());
        }
    };
    if let Some(face) = best_face {
        if owns(&face.memory_id) {
            push(&mut cited, &face.memory_id);
        }
    }
    if let Some(claim) = &claim {
        let pool: Vec<&ScoredMemory> = if best_face.is_some() {
            input.person_linked_memories.iter().collect()
        } else {
            own_memories
                .iter()
                .copied()
                .filter(|m| {
                    input
                        .memory_node_links
                        .get(&m.id)
                        .is_some_and(|ids| ids.contains(&claim.subject_node_id))
                })
                .collect()
        };
        for m in pool {
            if cited.len() >= RETRIEVAL.max_subject_memories + 1 {
                break;
            }
            if owns(&m.id) {
                push(&mut cited, &m.id);
            }
        }
    }

    KeeperResult {
        keeper_id: keeper.relative_id.clone(),
        claim,
        memory_ids: cited,
        v,
        r,
        reason: basis.reason(),
    }
}
