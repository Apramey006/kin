import { describe, it, expect } from "vitest";
import {
  validateGrounding,
  synthesizeCue,
  identitySentence,
  pickContextPath,
} from "../lib/synthesize";
import type { GraphEdgeRow, GraphNodeRow } from "../lib/types";

const node = (id: string, label: string, type: GraphNodeRow["type"], rel: string | null = null): GraphNodeRow => ({
  id,
  family_id: "demo",
  type,
  label,
  aliases: [],
  relation_to_wearer: rel,
});

const nodes = [
  node("rosa", "Rosa", "person", "self"),
  node("nora", "Nora", "person", "sister"),
  node("cake", "bake lemon cake on Sundays", "tradition"),
];
const edges: GraphEdgeRow[] = [
  { id: "e1", family_id: "demo", from_node: "nora", rel: "participates_in", to_node: "cake" },
];
const summaries = [
  "Maya shared a story: Grandma Rosa and Nora used to bake lemon cake every Sunday.",
];

describe("grounding validator", () => {
  const corpus = [...summaries, "Nora", "Rosa", "bake lemon cake on Sundays"];

  it("accepts a sentence whose named words are in the corpus", () => {
    expect(validateGrounding("You two baked lemon cake with Nora on Sundays.", corpus)).toBe(true);
  });

  it("rejects a name absent from the corpus", () => {
    expect(validateGrounding("You two baked with Uncle Marco.", corpus)).toBe(false);
  });

  it("rejects invented numbers", () => {
    expect(validateGrounding("You baked for 40 years.", corpus)).toBe(false);
  });
});

describe("cue synthesis", () => {
  it("builds identity + grounded context", async () => {
    const cue = await synthesizeCue({
      subject: nodes[1],
      nodes,
      edges,
      contextSummaries: summaries,
      wearerName: "Rosa",
      rewrite: async () => "You two baked lemon cake every Sunday.",
    });
    expect(cue.text).toBe("That's Nora, your sister. You two baked lemon cake every Sunday.");
    expect(cue.grounded).toBe(true);
  });

  it("falls back to a template when the LLM invents a name", async () => {
    const cue = await synthesizeCue({
      subject: nodes[1],
      nodes,
      edges,
      contextSummaries: summaries,
      wearerName: "Rosa",
      rewrite: async () => "You two visited Florence with Marco.",
    });
    expect(cue.grounded).toBe(false);
    expect(cue.text).toBe("That's Nora, your sister. You two bake lemon cake on Sundays.");
  });

  it("uses identity only when there is no context path", async () => {
    const cue = await synthesizeCue({
      subject: node("book", "recipe book", "object"),
      nodes,
      edges: [],
      contextSummaries: [],
      wearerName: "Rosa",
      rewrite: async () => "unused",
    });
    expect(cue.text).toBe("That's recipe book.");
  });

  it("picks participates_in then origin for the context path", () => {
    const italy = node("italy", "Italy", "place");
    const es: GraphEdgeRow[] = [
      ...edges,
      { id: "e2", family_id: "demo", from_node: "cake", rel: "origin", to_node: "italy" },
    ];
    const path = pickContextPath("nora", [...nodes, italy], es);
    expect(path?.node.id).toBe("cake");
    expect(path?.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("identitySentence handles objects and related people", () => {
    expect(identitySentence({ label: "Nora", type: "person", relation_to_wearer: "sister" })).toBe(
      "That's Nora, your sister."
    );
    expect(identitySentence({ label: "recipe book", type: "object", relation_to_wearer: null })).toBe(
      "That's recipe book."
    );
  });
});
