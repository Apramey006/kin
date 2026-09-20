/** P0 wire contract conformance: generate expectations from the actual TS gate. */
import { writeFileSync } from "node:fs";
import { evaluateGate, type GateInfo } from "../lib/gate";
import type { FaceOutcome, KeeperResult } from "../lib/types";
const face: FaceOutcome = { status: "matched", subjectNodeId: "nora", model: "fixture-only", enrollmentIds: ["enrollment"], distance: .3, v: 1 };
const k = (id: string, r = 1): KeeperResult => ({
  keeperId: id, claim: { subjectNodeId: "nora", label: "Nora" }, memoryIds: [id + "-memory"], v: 1, r,
  reason: "", support: "supports", evidence: [{ memoryId: id + "-memory", contributorId: id,
    subjectNodeId: "nora", source: "human", supportedFacts: ["Nora bakes lemon cake on Sundays."] }],
});
const cases: { name: string; input: { results: KeeperResult[]; info: GateInfo } }[] = [];
const add = (name: string, results: KeeperResult[], info: GateInfo = { face }) => cases.push({ name, input: { results, info } });
add("empty", []);
add("single-strongest", [k("maya")]);
add("duplicate-contributor", [k("maya"), k("maya")]);
add("two-human-sources", [k("maya"), k("elena")]);
for (const status of ["no_face", "unknown", "ambiguous", "unavailable"] as const)
  add(status, [k("maya"), k("elena")], { face: { status, model: "fixture-only" } });
add("provider-failure", [k("maya"), k("elena")], { face, providerFailure: true });
for (const v of [.5, .65, .8, .9, 1]) for (const r of [0, .4, .6, .8, 1])
  add("scores-" + v + "-" + r, [k("maya", r), k("elena", r)], { face: { ...face, v } });
for (const variant of ["no-evidence", "wrong-owner", "wrong-subject", "uncited", "blank-fact", "no-facts", "contradicts", "other-claim"] as const) {
  const a = k("maya");
  if (variant === "no-evidence") a.evidence = [];
  if (variant === "wrong-owner") a.evidence[0].contributorId = "elena";
  if (variant === "wrong-subject") a.evidence[0].subjectNodeId = "sam";
  if (variant === "uncited") a.memoryIds = ["another"];
  if (variant === "blank-fact") a.evidence[0].supportedFacts = [" "];
  if (variant === "no-facts") a.evidence[0].supportedFacts = [];
  if (variant === "contradicts") a.support = "contradicts";
  if (variant === "other-claim") a.claim!.subjectNodeId = "sam";
  add(variant, [a, k("elena")]);
}
add("duplicate-last-value", [k("maya"), k("elena"), k("maya", .2)]);
add("invalid-negative-score", [k("maya", -1), k("elena")]);
add("invalid-large-score", [k("maya", 2), k("elena")]);
const fixtures = cases.map(c => ({ ...c, expected: evaluateGate(c.input.results, c.input.info) }));
writeFileSync("conformance/gate-fixtures.json", JSON.stringify({ config: "P0: two human contributors, threshold 0.85", cases: fixtures }, null, 2) + "\n");
console.log(fixtures.length + " P0 gate fixtures written");
