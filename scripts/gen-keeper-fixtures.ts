/**
 * Freezes buildKeeperResult (the pure half of lib/keepers.ts) into
 * language-neutral JSON, the same way the gate fixtures work.
 *
 * Covers the claim paths (strong face, weak face, memory-linked subject,
 * memory with no linked subject, nothing) and the citation rules that stop
 * a keeper from citing a memory it does not own.
 */
import { writeFileSync } from "node:fs";
import { buildKeeperResult, type KeeperInput } from "../lib/keepers";
import type { Keeper } from "../lib/types";

const maya: Keeper = { relativeId: "maya", name: "Maya", color: "#f00" };

type Case = { name: string; keeper: Keeper; input: KeeperInput };

const base = (over: Partial<KeeperInput> = {}): KeeperInput => ({
  faceMatches: [],
  nodeLabels: { nora: "Nora", cabin: "the cabin", sam: "Sam" },
  nodeTypes: { nora: "person", cabin: "object", sunday: "tradition", sam: "person" },
  memoryOwners: {},
  memories: [],
  memoryNodeLinks: {},
  personLinkedMemories: [],
  ...over,
});

const cases: Case[] = [];

// --- face paths, swept across the v curve boundaries -------------------
for (const distance of [0.2, 0.35, 0.45, 0.55, 0.6, 0.7]) {
  cases.push({
    name: `face-distance-${distance}`,
    keeper: maya,
    input: base({
      faceMatches: [
        { person_node_id: "nora", contributor_id: "maya", memory_id: "m1", distance },
      ],
      memoryOwners: { m1: "maya" },
      personLinkedMemories: [{ id: "m2", summary: "sunday baking", similarity: 0 }],
    }),
  });
}

// another relative's enrollment must not produce a claim for this keeper
cases.push({
  name: "face-match-belongs-to-another-keeper",
  keeper: maya,
  input: base({
    faceMatches: [
      { person_node_id: "nora", contributor_id: "david", memory_id: "m9", distance: 0.2 },
    ],
    memoryOwners: { m9: "david" },
  }),
});

// closest own enrollment wins over a nearer foreign one
cases.push({
  name: "picks-closest-own-face-over-foreign",
  keeper: maya,
  input: base({
    faceMatches: [
      { person_node_id: "sam", contributor_id: "david", memory_id: "m9", distance: 0.1 },
      { person_node_id: "nora", contributor_id: "maya", memory_id: "m1", distance: 0.5 },
      { person_node_id: "sam", contributor_id: "maya", memory_id: "m4", distance: 0.3 },
    ],
    memoryOwners: { m1: "maya", m4: "maya", m9: "david" },
  }),
});

// --- memory paths, swept across the claimMinR boundary ----------------
for (const similarity of [0.2, 0.4, 0.5, 0.6, 0.8, 1.0]) {
  cases.push({
    name: `memory-similarity-${similarity}`,
    keeper: maya,
    input: base({
      memories: [{ id: "m1", summary: "nora bakes", similarity }],
      memoryOwners: { m1: "maya" },
      memoryNodeLinks: { m1: ["nora"] },
    }),
  });
}

// a memory linked only to a tradition yields no subject
cases.push({
  name: "memory-linked-only-to-tradition",
  keeper: maya,
  input: base({
    memories: [{ id: "m1", summary: "every sunday", similarity: 0.9 }],
    memoryOwners: { m1: "maya" },
    memoryNodeLinks: { m1: ["sunday"] },
  }),
});

// object-type subjects are claimable
cases.push({
  name: "memory-linked-to-object",
  keeper: maya,
  input: base({
    memories: [{ id: "m1", summary: "the cabin", similarity: 0.9 }],
    memoryOwners: { m1: "maya" },
    memoryNodeLinks: { m1: ["cabin"] },
  }),
});

// semantic hit the keeper does not own is ignored entirely
cases.push({
  name: "memory-not-owned-by-keeper",
  keeper: maya,
  input: base({
    memories: [{ id: "m9", summary: "someone else's", similarity: 0.95 }],
    memoryOwners: { m9: "david" },
    memoryNodeLinks: { m9: ["nora"] },
  }),
});

// --- citation cap ------------------------------------------------------
cases.push({
  name: "citation-cap-with-many-person-linked",
  keeper: maya,
  input: base({
    faceMatches: [
      { person_node_id: "nora", contributor_id: "maya", memory_id: "m1", distance: 0.2 },
    ],
    memoryOwners: { m1: "maya", m2: "maya", m3: "maya", m4: "maya", m5: "maya", m6: "david" },
    personLinkedMemories: [
      { id: "m2", summary: "a", similarity: 0 },
      { id: "m3", summary: "b", similarity: 0 },
      { id: "m4", summary: "c", similarity: 0 },
      { id: "m5", summary: "d", similarity: 0 },
      { id: "m6", summary: "not mine", similarity: 0 },
    ],
  }),
});

// nothing at all
cases.push({ name: "no-evidence", keeper: maya, input: base() });

const fixtures = cases.map((c) => ({
  name: c.name,
  input: { keeper: c.keeper, input: c.input },
  expected: buildKeeperResult(c.keeper, c.input),
}));

const claims = fixtures.filter((f) => f.expected.claim !== null).length;
writeFileSync(
  "conformance/keeper-fixtures.json",
  JSON.stringify({ cases: fixtures }, null, 2) + "\n"
);
console.log(
  `${fixtures.length} fixtures written: ${claims} claim, ${fixtures.length - claims} abstain`
);
