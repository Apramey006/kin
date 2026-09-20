import type {
  GraphEdgeRow,
  GraphNodeRow,
  MemoryRow,
  ProvenanceRow,
  Relative,
  WeaverQuestionRow,
} from "./types";

export type SceneMemory = MemoryRow & { mediaUrl: string | null };
export interface SceneData {
  relatives: Relative[];
  memories: SceneMemory[];
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  provenance: ProvenanceRow[];
  questions: WeaverQuestionRow[];
  relativeId: string | null;
  role?: string;
}

type Memory = SceneMemory;
export interface Perspective {
  memory: Memory;
  name: string;
  relation: string;
  color: string;
}

/** Build a scene from source links, never from similarity or invented narration. */
export function memoryScene(data: SceneData, anchorId?: string) {
  const edges = new Map(data.edges.map((edge) => [edge.id, edge]));
  const links = new Map<string, Set<string>>();
  for (const source of data.provenance) {
    const set = links.get(source.memory_id) ?? new Set<string>();
    if (source.node_id) set.add(source.node_id);
    const edge = source.edge_id ? edges.get(source.edge_id) : undefined;
    if (edge) {
      set.add(edge.from_node);
      set.add(edge.to_node);
    }
    links.set(source.memory_id, set);
  }
  const count = (id: string) =>
    new Set(
      data.memories
        .filter((m) => links.get(m.id)?.has(id))
        .map((m) => m.contributor_id),
    ).size;
  const candidates = data.nodes.filter(
    (n) => ["tradition", "event"].includes(n.type) && count(n.id) > 0,
  );
  const pending = data.questions.find(
    (q) =>
      q.status === "open" &&
      q.gap_type === "missing_origin" &&
      candidates.some((n) => n.id === q.gap_node_id),
  );
  const anchor = anchorId
    ? candidates.find((n) => n.id === anchorId)
    : (candidates.find((n) => n.id === pending?.gap_node_id) ??
      [...candidates].sort((a, b) => count(b.id) - count(a.id))[0]);
  if (!anchor) return null;
  const memories = data.memories.filter((m) => links.get(m.id)?.has(anchor.id));
  const owner = (memory: Memory): Perspective => {
    const person = data.relatives.find((r) => r.id === memory.contributor_id);
    return {
      memory,
      name: person?.name ?? "Your family",
      relation: person?.relation_to_wearer ?? "relative",
      color: person?.color ?? "#bcb5a3",
    };
  };
  // Keep established perspectives stable when a new answer arrives live.
  const perspectives = data.relatives
    .flatMap((person) => {
      const own = memories
        .filter((m) => m.contributor_id === person.id)
        .sort(
          (a, b) =>
            Number(a.kind === "answer") - Number(b.kind === "answer") ||
            a.created_at.localeCompare(b.created_at),
        );
      return own[0] ? [owner(own[0])] : [];
    })
    .slice(0, 3);
  const photo =
    perspectives.find((p) => p.memory.kind === "photo" && p.memory.mediaUrl)
      ?.memory ??
    memories.find((m) => m.kind === "photo" && m.mediaUrl) ??
    null;
  const latestAnswer = [...data.memories]
    .filter(
      (m) =>
        m.kind === "answer" &&
        data.questions.some(
          (q) =>
            q.id === m.source_question_id &&
            q.gap_node_id === anchor.id &&
            q.gap_type === "missing_origin",
        ),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const question =
    data.questions.find(
      (q) =>
        q.gap_node_id === anchor.id &&
        q.gap_type === "missing_origin" &&
        q.status === "open",
    ) ?? null;
  const originEdge = data.edges.find(
    (e) =>
      (e.from_node === anchor.id || e.to_node === anchor.id) &&
      ["origin", "started_by", "taught_by"].includes(e.rel) &&
      data.provenance.some(
        (p) => p.edge_id === e.id && memories.some((m) => m.id === p.memory_id),
      ),
  );
  const originNode = data.nodes.find(
    (n) =>
      n.id ===
      (originEdge?.from_node === anchor.id
        ? originEdge.to_node
        : originEdge?.from_node),
  );
  const originMemory =
    originEdge &&
    memories.find((m) =>
      data.provenance.some(
        (p) => p.edge_id === originEdge.id && p.memory_id === m.id,
      ),
    );
  const origin =
    originNode && originMemory
      ? { node: originNode, source: owner(originMemory) }
      : null;
  return {
    anchor,
    photo,
    perspectives,
    question,
    origin,
    latestAnswer: latestAnswer ? owner(latestAnswer) : null,
    recipient: data.relatives.find(
      (r) => r.id === question?.target_relative_id,
    ),
    photoOwner: photo ? owner(photo).name : null,
  };
}
export type MemorySceneData = NonNullable<ReturnType<typeof memoryScene>>;
