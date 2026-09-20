/** Canonical face + literal human evidence contract, shared with the Rust port. */
import { writeFileSync } from "node:fs";
import { buildKeeperResult, type KeeperInput } from "../lib/keepers";
import type { FaceOutcome } from "../lib/types";
const keeper = { relativeId: "maya", name: "Maya", color: "#f00" };
const face: FaceOutcome = { status: "matched", subjectNodeId: "nora", model: "fixture-only", enrollmentIds: ["enrollment"], distance: .3, v: 1 };
function memory(id = "m", owner = "maya", subject = "nora", text = "Nora bakes lemon cake on Sundays."): KeeperInput["memories"][number] {
  return { id, family_id: "670f5075-c286-4b29-8074-86401c18d0c0", contributor_id: owner, kind: "story", media_path: null, transcript: text,
    caption: null, summary: "model summary", source_question_id: null, created_at: "2026-01-01", source: { type: "human" }, similarity: .6,
    verified_facts: [{ id: id + "-fact", subjectNodeId: subject, text, contributorId: owner, memoryId: id, sourceSpan: { start: 0, end: text.length } }] };
}
const cases: { name: string; input: { keeper: typeof keeper; input: KeeperInput } }[] = [];
function add(name: string, memories: KeeperInput["memories"], outcome = face) {
  cases.push({ name, input: { keeper, input: { face: outcome, subjectLabel: "Nora", memories } } });
}
add("empty", []);
add("literal-human-story", [memory()]);
add("foreign-owner", [memory("foreign", "david")]);
add("unrelated-subject", [memory("unrelated", "maya", "sam")]);
add("citation-cap", Array.from({ length: 5 }, (_, i) => memory("m" + i)));
for (const status of ["no_face", "unknown", "ambiguous", "unavailable"] as const)
  add(status, [memory()], { status, model: "fixture-only" });
for (const similarity of [0, .2, .4, .6, .8, 1]) add("similarity-" + similarity, [{ ...memory(), similarity }]);
for (const text of ["This is Nora in the kitchen.", "A photo of Nora baking.", "Nora never baked lemon cake.", "Nora didn't bake lemon cake.", "Nora was not in Italy.", "Nora likes the northern evergreen trees.", "😀 Nora bakes lemon cake."])
  add(text, [memory("m", "maya", "nora", text)]);
const altered = memory(); altered.verified_facts![0].sourceSpan!.start = 1;
add("altered-span", [altered]);
add("vision-is-not-human", [{ ...memory(), transcript: null, caption: memory().transcript }]);
add("missing-human-source", [{ ...memory(), source: undefined }]);
const wrongFact = memory(); wrongFact.verified_facts![0].contributorId = "david";
add("borrowed-fact", [wrongFact]);
const fixtures = cases.map(c => ({ ...c, expected: buildKeeperResult(c.input.keeper, c.input.input) }));
writeFileSync("conformance/keeper-fixtures.json", JSON.stringify({ cases: fixtures }, null, 2) + "\n");
console.log(fixtures.length + " P0 keeper fixtures written");
