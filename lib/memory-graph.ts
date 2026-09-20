import type { GraphEdgeRow, GraphNodeRow, MemoryRow, ProvenanceRow, Relative } from "./types";

export interface MemoryGraphData {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  memories: MemoryRow[];
  provenance: ProvenanceRow[];
  relatives: Relative[];
}

export const EMPTY_MEMORY_GRAPH: MemoryGraphData = { nodes: [], edges: [], memories: [], provenance: [], relatives: [] };

export const ENTITY_STYLE = {
  person: { label: "People", singular: "Person", color: "#a9dfc2" },
  tradition: { label: "Traditions", singular: "Tradition", color: "#efc17c" },
  object: { label: "Objects", singular: "Object", color: "#91bfdc" },
  place: { label: "Places", singular: "Place", color: "#c3ace7" },
  event: { label: "Events", singular: "Event", color: "#efa99d" },
} as const;

const RELATION_LABELS: Record<string, string> = {
  sibling_of: "sister / brother of", child_of: "child of", parent_of: "parent of",
  grandchild_of: "grandchild of", spouse_of: "married to", friend_of: "friend of",
  participates_in: "takes part in", started_by: "started by", taught_by: "learned from",
  origin: "comes from", located_at: "takes place in", wears: "wears", owns: "owns",
  made: "made", happens_on: "happens on",
};

export function relationshipLabel(relation: string) {
  return RELATION_LABELS[relation] ?? relation.replaceAll("_", " ");
}

export function chronologicalMemories(memories: MemoryRow[]) {
  return [...memories].sort((first, second) =>
    first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id));
}

export function memoryConnections(data: MemoryGraphData, memoryIds: Iterable<string>) {
  const selected = new Set(memoryIds);
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const validNodes = new Set(data.nodes.map((node) => node.id));
  const edgeById = new Map(data.edges.map((edge) => [edge.id, edge]));
  for (const record of data.provenance) {
    if (!selected.has(record.memory_id)) continue;
    if (record.node_id && validNodes.has(record.node_id)) nodeIds.add(record.node_id);
    const edge = record.edge_id ? edgeById.get(record.edge_id) : undefined;
    if (edge && validNodes.has(edge.from_node) && validNodes.has(edge.to_node)) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.from_node);
      nodeIds.add(edge.to_node);
    }
  }
  return { nodeIds, edgeIds };
}

export function memoriesForEntity(data: MemoryGraphData, entityId: string) {
  return chronologicalMemories(data.memories).filter((memory) =>
    memoryConnections(data, [memory.id]).nodeIds.has(entityId));
}

export function graphAtMoment(data: MemoryGraphData, count: number) {
  const memories = chronologicalMemories(data.memories).slice(0, Math.max(0, count));
  const connections = memoryConnections(data, memories.map((memory) => memory.id));
  const present = count >= data.memories.length;
  const nodes = present ? data.nodes : data.nodes.filter((node) => connections.nodeIds.has(node.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = data.edges.filter((edge) => (present || connections.edgeIds.has(edge.id)) &&
    nodeIds.has(edge.from_node) && nodeIds.has(edge.to_node));
  return { nodes, edges, memories };
}

export interface GraphObstacle { x: number; y: number; width: number; height: number; id: string }

export function routeMemoryConnection(source: { x: number; y: number }, target: { x: number; y: number }, obstacles: GraphObstacle[], sourceId: string, targetId: string, labelWidth: number) {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const normal = { x: -deltaY / distance, y: deltaX / distance };
  let best: { path: string; labelX: number; labelY: number; score: number } | null = null;
  for (const bend of [40, -40, 100, -100, 180, -180, 280, -280]) {
    const control = { x: (source.x + target.x) / 2 + normal.x * bend, y: (source.y + target.y) / 2 + normal.y * bend };
    const pointAt = (time: number) => ({
      x: (1 - time) ** 2 * source.x + 2 * (1 - time) * time * control.x + time ** 2 * target.x,
      y: (1 - time) ** 2 * source.y + 2 * (1 - time) * time * control.y + time ** 2 * target.y,
    });
    let collisions = 0;
    for (const obstacle of obstacles) {
      if (obstacle.id === sourceId || obstacle.id === targetId) continue;
      for (let sample = 1; sample < 10; sample++) {
        const point = pointAt(sample / 10);
        if (point.x > obstacle.x - 8 && point.x < obstacle.x + obstacle.width + 8 && point.y > obstacle.y - 8 && point.y < obstacle.y + obstacle.height + 8) collisions++;
      }
    }
    for (const time of [0.5, 0.35, 0.65]) {
      const label = pointAt(time);
      const labelCollisions = obstacles.filter((obstacle) => label.x + labelWidth / 2 + 8 > obstacle.x &&
        label.x - labelWidth / 2 - 8 < obstacle.x + obstacle.width && label.y + 20 > obstacle.y && label.y - 20 < obstacle.y + obstacle.height).length;
      const score = labelCollisions * 1000 + collisions * 30 + Math.abs(bend) * 0.01 + Math.abs(time - 0.5);
      if (!best || score < best.score) best = {
        path: `M ${source.x} ${source.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`,
        labelX: label.x, labelY: label.y, score,
      };
    }
  }
  return best!;
}

export function layoutMemoryGraph(data: MemoryGraphData, orientation: "landscape" | "portrait" = "landscape") {
  const nodes = [...data.nodes].sort((first, second) => first.id.localeCompare(second.id));
  const root = nodes.find((node) => node.relation_to_wearer === "self");
  const points = new Map<string, { x: number; y: number }>();
  const allIds = [...nodes.map((node) => node.id), ...chronologicalMemories(data.memories).map((memory) => `memory:${memory.id}`)];
  nodes.forEach((node, index) => {
    const radius = node.id === root?.id ? 0 : 260 + Math.floor(index / 7) * 170;
    const angle = index * 2.399963 + 0.4;
    points.set(node.id, radius === 0 ? { x: 0, y: 0 } : { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.8 });
  });
  const memories = chronologicalMemories(data.memories);
  memories.forEach((memory, index) => {
    const angle = index * 2.399963 + 1.3;
    const radius = 520 + Math.floor(index / 10) * 190;
    points.set(`memory:${memory.id}`, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.8 });
  });
  const links = data.edges.map((edge) => ({ source: edge.from_node, target: edge.to_node }));
  for (const memory of memories) {
    const connections = memoryConnections(data, [memory.id]);
    for (const nodeId of connections.nodeIds) links.push({ source: `memory:${memory.id}`, target: nodeId });
  }
  const iterations = allIds.length > 200 ? 0 : 140;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const forces = new Map(allIds.map((id) => [id, { x: 0, y: 0 }]));
    for (let first = 0; first < allIds.length; first++) {
      for (let second = first + 1; second < allIds.length; second++) {
        const firstPoint = points.get(allIds[first])!;
        const secondPoint = points.get(allIds[second])!;
        const deltaX = firstPoint.x - secondPoint.x || 0.01;
        const deltaY = firstPoint.y - secondPoint.y || 0.01;
        const distance = Math.max(1, Math.hypot(deltaX, deltaY));
        const strength = 16000 / (distance * distance) + Math.max(0, 210 - distance) * 0.09;
        const forceX = deltaX / distance * strength;
        const forceY = deltaY / distance * strength;
        const firstForce = forces.get(allIds[first])!;
        const secondForce = forces.get(allIds[second])!;
        firstForce.x += forceX;
        firstForce.y += forceY;
        secondForce.x -= forceX;
        secondForce.y -= forceY;
      }
    }
    for (const link of links) {
      const source = points.get(link.source);
      const target = points.get(link.target);
      if (!source || !target) continue;
      const distance = Math.max(1, Math.hypot(target.x - source.x, target.y - source.y));
      const strength = (distance - (link.source.startsWith("memory:") ? 310 : 230)) * 0.012;
      const forceX = (target.x - source.x) / distance * strength;
      const forceY = (target.y - source.y) / distance * strength;
      forces.get(link.source)!.x += forceX;
      forces.get(link.source)!.y += forceY;
      forces.get(link.target)!.x -= forceX;
      forces.get(link.target)!.y -= forceY;
    }
    for (const id of allIds) {
      if (id === root?.id) continue;
      const point = points.get(id)!;
      const force = forces.get(id)!;
      point.x += Math.max(-12, Math.min(12, force.x));
      point.y += Math.max(-12, Math.min(12, force.y));
    }
  }
  for (const point of points.values()) {
    point.x *= orientation === "landscape" ? 1.45 : 0.9;
    point.y *= orientation === "landscape" ? 0.7 : 1;
  }
  return points;
}
