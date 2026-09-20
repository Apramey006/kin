/**
 * Freezes the current TypeScript gate behavior into language-neutral JSON.
 *
 * Any port of the gate must reproduce conformance/gate-fixtures.json exactly.
 * The sweep is deterministic and covers the honest cases (agreeing keepers,
 * strong evidence) alongside the adversarial ones the gate exists to catch:
 * disagreement, borrowed memories, missing provenance, text-only evidence.
 */
import { writeFileSync } from "node:fs";
import { evaluateGate, type GateInfo } from "../lib/gate";
import type { KeeperResult } from "../lib/types";

type Case = { name: string; results: KeeperResult[]; info: GateInfo };

const k = (
  id: string,
  subject: string | null,
  v: number,
  r: number,
  memoryIds: string[] = []
): KeeperResult => ({
  keeperId: id,
  claim: subject ? { subjectNodeId: subject, label: subject } : null,
  memoryIds,
  v,
  r,
  reason: "",
});

const info = (
  owners: Record<string, string>,
  kinds: Record<string, string> = {},
  subjects: string[] = ["nora"]
): GateInfo => ({
  memoryOwners: owners,
  memoryKinds: kinds,
  subjectProvenance: Object.fromEntries(subjects.map((s) => [s, true])),
});

const cases: Case[] = [];

// --- honest positives -------------------------------------------------
cases.push({
  name: "worked-example-two-strong-agreeing",
  results: [
    k("maya", "nora", 0.93, 0.91, ["m1"]),
    k("david", "nora", 0.89, 0.88, ["m2"]),
    k("elena", null, 0, 0.1),
  ],
  info: info({ m1: "maya", m2: "david" }, { m1: "photo", m2: "photo" }),
});

// --- adversarial: disagreement ---------------------------------------
cases.push({
  name: "two-keepers-different-subjects",
  results: [k("maya", "nora", 0.9, 0.9, ["m1"]), k("david", "sam", 0.9, 0.9, ["m2"])],
  info: info({ m1: "maya", m2: "david" }, { m1: "photo", m2: "photo" }, ["nora", "sam"]),
});
cases.push({
  name: "strong-majority-with-one-dissenter",
  results: [
    k("maya", "nora", 0.95, 0.95, ["m1"]),
    k("david", "nora", 0.94, 0.93, ["m2"]),
    k("elena", "sam", 0.4, 0.5, ["m3"]),
  ],
  info: info(
    { m1: "maya", m2: "david", m3: "elena" },
    { m1: "photo", m2: "photo", m3: "photo" },
    ["nora", "sam"]
  ),
});

// --- adversarial: provenance / ownership ------------------------------
cases.push({
  name: "keeper-cites-memory-it-does-not-own",
  results: [k("maya", "nora", 0.95, 0.95, ["m2"]), k("david", "nora", 0.93, 0.92, ["m2"])],
  info: info({ m2: "david" }, { m2: "photo" }),
});
cases.push({
  name: "subject-has-no-provenance",
  results: [k("maya", "nora", 0.95, 0.95, ["m1"]), k("david", "nora", 0.94, 0.93, ["m2"])],
  info: {
    memoryOwners: { m1: "maya", m2: "david" },
    memoryKinds: { m1: "photo", m2: "photo" },
    subjectProvenance: {},
  },
});
cases.push({
  name: "agreeing-keeper-cites-nothing",
  results: [k("maya", "nora", 0.95, 0.95, ["m1"]), k("david", "nora", 0.94, 0.93, [])],
  info: info({ m1: "maya" }, { m1: "photo" }),
});

// --- adversarial: text-only evidence (S drops to 0.5) -----------------
cases.push({
  name: "text-only-evidence-no-visual",
  results: [k("maya", "nora", 0, 0.95, ["m1"]), k("david", "nora", 0, 0.93, ["m2"])],
  info: info({ m1: "maya", m2: "david" }, { m1: "story", m2: "story" }),
});

// --- adversarial: the stranger ---------------------------------------
cases.push({
  name: "stranger-no-keeper-claims",
  results: [k("maya", null, 0, 0.1), k("david", null, 0, 0.05)],
  info: info({}),
});

// --- single claimant sweep (A = 0.75 path) ---------------------------
for (const v of [0.6, 0.8, 0.95]) {
  for (const r of [0.5, 0.75, 0.95]) {
    cases.push({
      name: `single-claimant-v${v}-r${r}`,
      results: [k("maya", "nora", v, r, ["m1"]), k("david", null, 0, 0.1)],
      info: info({ m1: "maya" }, { m1: "photo" }),
    });
  }
}

// --- threshold boundary sweep: two agreeing keepers -------------------
for (const v of [0.5, 0.65, 0.8, 0.9, 1.0]) {
  for (const r of [0.4, 0.6, 0.8, 1.0]) {
    cases.push({
      name: `two-agreeing-v${v}-r${r}`,
      results: [k("maya", "nora", v, r, ["m1"]), k("david", "nora", v - 0.05, r - 0.05, ["m2"])],
      info: info({ m1: "maya", m2: "david" }, { m1: "photo", m2: "photo" }),
    });
  }
}

const fixtures = cases.map((c) => ({
  name: c.name,
  input: { results: c.results, info: c.info },
  expected: evaluateGate(c.results, c.info),
}));

const speak = fixtures.filter((f) => f.expected.decision === "speak").length;
writeFileSync(
  "conformance/gate-fixtures.json",
  JSON.stringify({ config: "gate weights from lib/config.ts", cases: fixtures }, null, 2) + "\n"
);
console.log(
  `${fixtures.length} fixtures written: ${speak} speak, ${fixtures.length - speak} silent`
);
