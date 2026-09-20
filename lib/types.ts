export type NodeType = "person" | "event" | "tradition" | "object" | "place";
export type MemoryKind = "photo" | "story" | "answer";

export interface Relative {
  id: string;
  family_id: string;
  name: string;
  relation_to_wearer: string;
  color: string;
}

export interface Wearer {
  family_id: string;
  name: string;
}

export interface GraphNodeRow {
  id: string;
  family_id: string;
  type: NodeType;
  label: string;
  aliases: string[];
  relation_to_wearer: string | null;
  created_at?: string;
}

export interface GraphEdgeRow {
  id: string;
  family_id: string;
  from_node: string;
  rel: string;
  to_node: string;
  created_at?: string;
}

export interface MemoryRow {
  id: string;
  family_id: string;
  contributor_id: string;
  kind: MemoryKind;
  media_path: string | null;
  transcript: string | null;
  caption: string | null;
  summary: string;
  source_question_id: string | null;
  created_at: string;
  source?: { type: "human"; caption?: string; [key: string]: unknown };
  verified_facts?: VerifiedFact[];
}

export interface ProvenanceRow {
  id: string;
  memory_id: string;
  node_id: string | null;
  edge_id: string | null;
  contributor_id: string;
}

export interface WeaverQuestionRow {
  id: string;
  family_id: string;
  target_relative_id: string;
  gap_node_id: string | null;
  gap_type: string;
  question_text: string;
  evidence: { memory_id: string; contributor_id: string; summary: string }[];
  status: "open" | "answered" | "superseded";
  answer_memory_id: string | null;
  created_at: string;
}

export interface Keeper {
  relativeId: string;
  name: string;
  color: string;
}

export interface RecallContext {
  faceDescriptors: number[][];
  sceneCaption: string;
  sceneEmbedding: number[];
}

export interface KeeperResult {
  keeperId: string;
  claim: { subjectNodeId: string; label: string } | null;
  memoryIds: string[];
  v: number;
  r: number;
  reason: string;
  support: "supports" | "contradicts" | "abstains";
  evidence: Evidence[];
}

export type FaceOutcome =
  | { status: "matched"; subjectNodeId: string; model: string; enrollmentIds: string[]; distance: number; v: number }
  | { status: "no_face" | "unknown" | "ambiguous" | "unavailable"; model: string };

export interface Evidence {
  memoryId: string;
  contributorId: string;
  subjectNodeId: string;
  source: "human";
  supportedFacts: string[];
}

export interface VerifiedFact {
  id: string;
  subjectNodeId: string;
  text: string;
  contributorId: string;
  memoryId: string;
  sourceSpan?: { start: number; end: number };
}

export type SilenceReasonCode = "no_face" | "unknown_face" | "ambiguous_face" | "insufficient_evidence" | "contradiction" | "no_provenance" | "below_threshold" | "provider_failure" | "grounding_failure";

export interface GateResult {
  V: number;
  R: number;
  A: number;
  S: number;
  X: number;
  C: number;
  threshold: number;
  decision: "speak" | "silent";
  reason: string;
  subjectNodeId: string | null;
  agreeingKeeperIds: string[];
  citedMemoryIds: string[];
  reasonCode?: SilenceReasonCode;
}

export interface RecallEventRow {
  id: string;
  family_id: string;
  status: "running" | "speak" | "silent";
  snapshot_path: string | null;
  keeper_results: KeeperResult[] | null;
  gate: GateResult | null;
  cue_text: string | null;
  silence_reason: string | null;
  latency_ms: number | null;
  face_descriptors: number[][] | null;
  created_at: string;
}
