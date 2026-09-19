import { describe, it, expect } from "vitest";
import { isAllowedRel, findNodeByLabel, neighborIds } from "../lib/graph";
import type { GraphNodeRow } from "../lib/types";

const node = (
  id: string,
  type: GraphNodeRow["type"],
  label: string,
  aliases: string[] = []
): GraphNodeRow => ({
  id,
  family_id: "fam",
  type,
  label,
  aliases,
  relation_to_wearer: null,
});

describe("isAllowedRel", () => {
  it("accepts participates_in and rejects knows", () => {
    expect(isAllowedRel("participates_in")).toBe(true);
    expect(isAllowedRel("knows")).toBe(false);
  });
});

describe("findNodeByLabel", () => {
  const nodes = [
    node("nora", "person", "Nora", ["Aunt Nora"]),
    node("cake", "tradition", "Sunday baking"),
  ];

  it("matches labels case-insensitively", () => {
    expect(findNodeByLabel(nodes, "person", "  NORA ")?.id).toBe("nora");
  });

  it("matches aliases case-insensitively", () => {
    expect(findNodeByLabel(nodes, "person", "aunt nora")?.id).toBe("nora");
  });

  it("does not match a node of a different type", () => {
    expect(findNodeByLabel(nodes, "object", "Nora")).toBeUndefined();
    expect(findNodeByLabel(nodes, "person", "Sunday baking")).toBeUndefined();
  });
});

describe("neighborIds", () => {
  it("returns both directions and excludes the node itself", () => {
    const edges = [
      { from_node: "a", to_node: "b" },
      { from_node: "c", to_node: "a" },
      { from_node: "d", to_node: "e" },
    ];
    const ids = neighborIds("a", edges);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(true);
    expect(ids.has("a")).toBe(false);
    expect(ids.has("d")).toBe(false);
  });
});
