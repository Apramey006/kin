"use client";

import { useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import type { GraphEdgeRow, GraphNodeRow, ProvenanceRow, Relative } from "@/lib/types";

export function FamilyGraph({
  nodes,
  edges,
  provenance,
  relatives,
  gapNodeId,
  wearerNodeId,
}: {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  provenance: ProvenanceRow[];
  relatives: Relative[];
  gapNodeId?: string | null;
  wearerNodeId?: string | null;
}) {
  const seen = useRef(new Set<string>());

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    const relColor = new Map(relatives.map((r) => [r.id, r.color]));
    const edgeOwner = new Map<string, string>();
    for (const p of provenance) {
      const c = relColor.get(p.contributor_id) ?? "#8b8579";
      if (p.node_id && !map.has(p.node_id)) map.set(p.node_id, c);
      if (p.edge_id && !edgeOwner.has(p.edge_id)) edgeOwner.set(p.edge_id, c);
    }
    return { node: map, edge: edgeOwner };
  }, [provenance, relatives]);

  const rfNodes: Node[] = useMemo(() => {
    const centerX = 0;
    const centerY = 0;
    return nodes.map((n, i) => {
      const isWearer = n.id === wearerNodeId;
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      const radius = 90 + Math.floor(i / 6) * 110;
      const isNew = !seen.current.has(n.id);
      seen.current.add(n.id);
      return {
        id: n.id,
        position: isWearer
          ? { x: centerX, y: centerY }
          : { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
        data: {
          label: `${n.label}${n.relation_to_wearer && n.relation_to_wearer !== "self" ? ` · ${n.relation_to_wearer}` : ""}`,
        },
        className: [
          isNew ? "node-pop" : "",
          n.id === gapNodeId ? "gap-pulse" : "",
        ]
          .filter(Boolean)
          .join(" ") || undefined,
        style: {
          background: isWearer ? "#2F5D50" : colorOf.node.get(n.id) ?? "#2a3140",
          color: "#fff",
          border: n.id === gapNodeId ? "3px solid #E0A458" : "1px solid rgba(255,255,255,0.2)",
          borderRadius: 12,
          padding: "8px 14px",
          fontSize: 15,
          fontWeight: 600,
          boxShadow: n.id === gapNodeId ? undefined : "0 2px 10px rgba(0,0,0,0.4)",
        },
      };
    });
  }, [nodes, colorOf, gapNodeId, wearerNodeId]);

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.from_node,
        target: e.to_node,
        label: e.rel.replace(/_/g, " "),
        animated: e.id === gapNodeId,
        style: { stroke: colorOf.edge.get(e.id) ?? "#556", strokeWidth: 2 },
        labelStyle: { fill: "#aab", fontSize: 11 },
        labelBgStyle: { fill: "#0E1116", fillOpacity: 0.8 },
      })),
    [edges, colorOf, gapNodeId]
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      fitView
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnScroll={false}
      panOnDrag={false}
      preventScrolling={false}
    >
      <Background color="#1a2030" gap={24} />
    </ReactFlow>
  );
}
