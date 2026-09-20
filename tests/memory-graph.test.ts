import { describe, expect, it } from "vitest";
import { DEMO_MEMORY_GRAPH } from "../lib/memory-graph-demo";
import { chronologicalMemories, graphAtMoment, layoutMemoryGraph, memoriesForEntity, memoryConnections, relationshipLabel, routeMemoryConnection } from "../lib/memory-graph";

describe("memory graph provenance and playback", () => {
  it("reveals only connections sourced by memories available at that moment", () => {
    const first = graphAtMoment(DEMO_MEMORY_GRAPH, 1);
    expect(first.memories.map((memory) => memory.id)).toEqual(["first"]);
    expect(first.nodes.map((node) => node.id).sort()).toEqual(["apron", "cake", "nora", "rosa"]);
    expect(first.edges.map((edge) => edge.id).sort()).toEqual(["nora-apron", "nora-cake", "rosa-cake"]);
    expect(first.edges.some((edge) => edge.rel === "sibling_of")).toBe(false);
    expect(graphAtMoment(DEMO_MEMORY_GRAPH, 0)).toEqual({ nodes: [], edges: [], memories: [] });
  });
  it("a Weaver answer fills the graph gap without inventing earlier provenance", () => {
    expect(graphAtMoment(DEMO_MEMORY_GRAPH, 3).nodes.some((node) => node.id === "mother")).toBe(false);
    const answered = graphAtMoment(DEMO_MEMORY_GRAPH, 4);
    expect(answered.nodes.some((node) => node.id === "mother")).toBe(true);
    expect(answered.edges.some((edge) => edge.id === "cake-italy")).toBe(true);
    expect(answered.nodes.some((node) => node.id === "summer")).toBe(false);
  });
  it("includes endpoints when only an edge has provenance", () => {
    const edgeOnly = { ...DEMO_MEMORY_GRAPH, provenance: DEMO_MEMORY_GRAPH.provenance.filter((record) => record.edge_id === "nora-mother") };
    const connections = memoryConnections(edgeOnly, ["fourth"]);
    expect([...connections.nodeIds].sort()).toEqual(["mother", "nora"]);
    expect(memoriesForEntity(edgeOnly, "mother").map((memory) => memory.id)).toEqual(["fourth"]);
  });
  it("ignores dangling edges and unrelated source records", () => {
    const data = { ...DEMO_MEMORY_GRAPH, nodes: DEMO_MEMORY_GRAPH.nodes.filter((node) => node.id !== "mother") };
    const connections = memoryConnections(data, ["fourth"]);
    expect(connections.nodeIds.has("mother")).toBe(false);
    expect(connections.edgeIds.has("nora-mother")).toBe(false);
    expect(graphAtMoment(data, data.memories.length).edges.some((edge) => edge.id === "nora-mother")).toBe(false);
    expect(memoryConnections(data, ["unknown"]).nodeIds.size).toBe(0);
  });
  it("keeps unsupported current entities visible without assigning a source", () => {
    const data = { ...DEMO_MEMORY_GRAPH, provenance: [] };
    expect(graphAtMoment(data, 1).nodes).toEqual([]);
    expect(graphAtMoment(data, data.memories.length).nodes).toHaveLength(data.nodes.length);
    expect(memoriesForEntity(data, "rosa")).toEqual([]);
  });
  it("orders stories independently of database row order", () => {
    expect(chronologicalMemories([...DEMO_MEMORY_GRAPH.memories].reverse()).map((memory) => memory.id))
      .toEqual(["first", "second", "third", "fourth", "fifth"]);
  });
  it("keeps deterministic, finite positions as the timeline changes", () => {
    const positions = layoutMemoryGraph(DEMO_MEMORY_GRAPH);
    expect(positions).toEqual(layoutMemoryGraph({ ...DEMO_MEMORY_GRAPH, nodes: [...DEMO_MEMORY_GRAPH.nodes].reverse() }));
    expect(positions.size).toBe(DEMO_MEMORY_GRAPH.nodes.length + DEMO_MEMORY_GRAPH.memories.length);
    expect(positions.get("rosa")).toEqual({ x: 0, y: 0 });
    for (const point of positions.values()) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });
  it("uses clear relationship labels while preserving unknown relations", () => {
    expect(relationshipLabel("taught_by")).toBe("learned from");
    expect(relationshipLabel("visited_with")).toBe("visited with");
  });
  it("routes a relationship label around an intervening entity", () => {
    const obstacle = { id: "person", x: 100, y: -50, width: 100, height: 100 };
    const route = routeMemoryConnection({ x: 0, y: 0 }, { x: 300, y: 0 }, [obstacle], "source", "target", 80);
    expect(Math.abs(route.labelY)).toBeGreaterThan(70);
    expect(route.score).toBeLessThan(30);
    expect(route.path).toMatch(/^M 0 0 Q /);
  });
});
