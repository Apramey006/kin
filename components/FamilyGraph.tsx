"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  UserRound,
  Heart,
  MapPin,
  CalendarDays,
  BookOpen,
  Network,
  List,
  X,
} from "lucide-react";
import type {
  GraphNodeRow,
  GraphEdgeRow,
  ProvenanceRow,
  Relative,
} from "@/lib/types";
const icons = {
  person: UserRound,
  tradition: Heart,
  event: CalendarDays,
  object: BookOpen,
  place: MapPin,
};
const relationWords: Record<string, string> = {
  origin: "comes from",
  started_by: "was started by",
  taught_by: "learned from",
  participates_in: "takes part in",
  located_at: "is connected to",
  sibling_of: "is a sibling of",
  child_of: "is a child of",
  parent_of: "is a parent of",
  grandchild_of: "is a grandchild of",
  spouse_of: "is married to",
  friend_of: "is friends with",
  wears: "wears",
  owns: "keeps",
  made: "made",
  happens_on: "happens on",
};
export function FamilyGraph({
  nodes,
  edges,
  provenance,
  relatives,
  wearerNodeId,
  subjectId,
}: {
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
  provenance: ProvenanceRow[];
  relatives: Relative[];
  wearerNodeId?: string | null;
  subjectId?: string | null;
}) {
  const [view, setView] = useState<"map" | "list">("map");
  const [selected, setSelected] = useState<string | null>(null);
  const layout = useMemo(() => {
    const center =
      nodes.find((n) => n.id === (selected || subjectId || wearerNodeId)) ??
      nodes[0];
    if (!center) return [];
    const connected = new Set(
      edges
        .filter((e) => e.from_node === center.id || e.to_node === center.id)
        .flatMap((e) => [e.from_node, e.to_node]),
    );
    const others = nodes
      .filter((n) => n.id !== center.id)
      .sort((a, b) => Number(connected.has(b.id)) - Number(connected.has(a.id)))
      .slice(0, 6);
    return [
      { node: center, x: 50, y: 48, center: true },
      ...others.map((node, i) => {
        const angle = -Math.PI / 2 + (i / others.length) * Math.PI * 2;
        return {
          node,
          x: 50 + 32 * Math.cos(angle),
          y: 48 + 31 * Math.sin(angle),
          center: false,
        };
      }),
    ];
  }, [nodes, edges, subjectId, wearerNodeId, selected]);
  const selectedNode = nodes.find((n) => n.id === selected);
  const relevant = selected
    ? edges.filter((e) => e.from_node === selected || e.to_node === selected)
    : edges;
  const name = (id: string) =>
    nodes.find((n) => n.id === id)?.label ?? "Someone";
  return (
    <section className="map-card" aria-labelledby="map-title">
      <div className="panel-heading">
        <div>
          <h2 id="map-title">Family map</h2>
          <p>Select a person or memory to explore.</p>
        </div>
        <div className="segmented" role="group" aria-label="Connection view">
          <button
            aria-pressed={view === "map"}
            aria-label="Show connection map"
            onClick={() => setView("map")}
          >
            <Network size={17} aria-hidden="true" />
          </button>
          <button
            aria-pressed={view === "list"}
            aria-label="Show connection list"
            onClick={() => setView("list")}
          >
            <List size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      {!nodes.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Network aria-hidden="true" />
          </div>
          <h3>No connections yet</h3>
          <p>
            Photos and voice memories connect people, places, and traditions.
          </p>
        </div>
      ) : view === "map" ? (
        <>
          <div
            className="memory-map"
            aria-label="Family connections. Select a person or memory to explore."
          >
            <svg
              className="map-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {edges.map((e) => {
                const from = layout.find((p) => p.node.id === e.from_node);
                const to = layout.find((p) => p.node.id === e.to_node);
                if (!from || !to) return null;
                return (
                  <path
                    key={e.id}
                    className={
                      e.from_node === selected || e.to_node === selected
                        ? "highlight"
                        : ""
                    }
                    vectorEffect="non-scaling-stroke"
                    d={`M ${from.x} ${from.y} Q ${(from.x + to.x) / 2 + 4} ${(from.y + to.y) / 2 - 4} ${to.x} ${to.y}`}
                  />
                );
              })}
            </svg>
            {layout.map(({ node, x, y, center }) => {
              const Icon = icons[node.type];
              return (
                <button
                  key={node.id}
                  className={`map-node node-${node.type} ${center ? "center" : ""}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  aria-label={`${node.label}, ${node.type}. Explore connections`}
                  aria-pressed={selected === node.id}
                  onClick={() =>
                    setSelected(selected === node.id ? null : node.id)
                  }
                >
                  <span className="node-symbol">
                    <Icon aria-hidden="true" />
                  </span>
                  <strong>{node.label}</strong>
                </button>
              );
            })}
          </div>
          <div className="map-legend">
            <span>
              <UserRound aria-hidden="true" />
              People
            </span>
            <span>
              <Heart aria-hidden="true" />
              Traditions
            </span>
            <span>
              <MapPin aria-hidden="true" />
              Places
            </span>
            <span>
              <BookOpen aria-hidden="true" />
              Objects
            </span>
            {nodes.length > 7 && (
              <button
                className="button button-quiet button-sm"
                onClick={() => setView("list")}
              >
                See all {nodes.length} connections
              </button>
            )}
          </div>
          {selectedNode && (
            <div className="map-selection" aria-live="polite">
              <button
                className="icon-button selection-close"
                aria-label="Close connection details"
                onClick={() => setSelected(null)}
              >
                <X aria-hidden="true" />
              </button>
              <strong>
                {selectedNode.label}
                {selectedNode.relation_to_wearer &&
                selectedNode.relation_to_wearer !== "self"
                  ? ` · ${selectedNode.relation_to_wearer}`
                  : ""}
              </strong>
              <ul className="connections-list">
                {relevant.map((e) => (
                  <li key={e.id}>
                    {name(e.from_node)}{" "}
                    <span className="connection-rel">
                      {relationWords[e.rel] ?? e.rel.replaceAll("_", " ")}
                    </span>{" "}
                    {name(e.to_node)}
                  </li>
                ))}
              </ul>
              <p className="small muted" style={{ marginTop: 10 }}>
                Shared by{" "}
                {[
                  ...new Set(
                    provenance
                      .filter((p) => p.node_id === selected)
                      .map(
                        (p) =>
                          relatives.find((r) => r.id === p.contributor_id)
                            ?.name,
                      )
                      .filter(Boolean),
                  ),
                ].join(", ") || "your family"}
                .
              </p>
              <Link className="button button-quiet button-sm" style={{ marginTop: 12 }} href={`/stories?topic=${encodeURIComponent(selectedNode.id)}`}>Hear the story</Link>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: "10px 0 18px" }}>
          <ul className="connections-list">
            {edges.length
              ? edges.map((e) => (
                  <li key={e.id}>
                    <strong>{name(e.from_node)}</strong>
                    <span className="connection-rel">
                      {relationWords[e.rel] ?? e.rel.replaceAll("_", " ")}
                    </span>
                    <strong>{name(e.to_node)}</strong>
                  </li>
                ))
              : nodes.map((n) => (
                  <li key={n.id}>
                    <strong>{n.label}</strong>
                    <span className="connection-rel">
                      {n.relation_to_wearer || n.type}
                    </span>
                  </li>
                ))}
          </ul>
        </div>
      )}
    </section>
  );
}
