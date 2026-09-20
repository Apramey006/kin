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
}

export interface WeaverQuestionRow {
  id: string;
  family_id: string;
  target_relative_id: string;
  gap_node_id: string | null;
  gap_type: string;
  question_text: string;
  evidence: { memory_id: string; contributor_id: string; summary: string }[];
  status: "open" | "answered";
  answer_memory_id: string | null;
  created_at: string;
}

export interface RecallResponse {
  decision: "speak" | "silent";
  cueText?: string;
  audio?: string;
  reason?: string;
  eventId?: string;
  latencyMs?: number;
}

export interface PhotoUploadResponse {
  memory_id: string;
  media_path: string;
  caption: string;
  summary: string;
  entities: { label: string; type: string; relation_to_wearer: string | null }[];
  persons: { index: number; node_id: string }[];
}

export interface StoryUploadResponse {
  memory_id: string;
  transcript: string;
  summary: string;
  entities: { label: string; type: string; relation_to_wearer: string | null }[];
}

export interface FaceLabel {
  person_node_id?: string;
  new_person?: { name: string; relation_to_wearer: string };
  box?: { x: number; y: number; width: number; height: number };
}
