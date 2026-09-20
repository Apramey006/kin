# Kin product sprint — 2026-09-20

## What shipped

- **Prepare `/prepare`**: select a real family person before meeting them. Read
  one short, exact human quote under their name and recorded relationship.
  Expand More context or Why this?, and follow a source into the live Atlas.
- **Assist `/wearer`**: successful recall has the same identity/relationship/
  quote hierarchy. Contributor IDs resolve to family names; self memories use
  “You”. TTS selects one exact attributed fact, with the existing 30-word limit.
  The evidence card stays until dismissed or superseded. A new capture or SILENT
  cancels prior audio and clears all prior context. Old cue-only responses still work.
- **Family gap preview**: “Kin noticed a gap” shows the deterministic Weaver
  candidate and likely relative. It reads existing questions, but never creates
  one. Stage's Run Weaver and the assigned inbox remain the demo controls.
- **Reflect `/today`**: reads the latest 100 saved camera checks within the
  device's local day. Displays only finalized, matched events. A camera check is
  explicitly not proof of a meeting or conversation. No new memory is created.
- **Trust/accessibility**: the photo permission confirmation explicitly covers
  recognition of selected faces; unselected faces are not enrolled. Pinch zoom
  is enabled. Optional evidence details use native keyboard-accessible controls.

## Evidence and API decisions

`GET /api/prepare[?person=<UUID>]` requires a verified family session, including
persisted wearer membership. All node, relative and memory reads are scoped to
that family; provenance is queried only for those memory IDs. Responses are
private/no-store. It returns `{briefings: [{status, context}]}`. Status is ready,
insufficient or disputed. Non-ready responses contain no quotes or supporters.
Unknown/foreign person IDs return 404. The endpoint performs only reads.

`lib/briefing.ts` reuses `humanFacts` literal-source validation and the existing
explicit-denial rule. It additionally requires direct subject provenance and
matching contributor ownership. At least two distinct contributors must have
eligible memories. Short recurring/shared-life phrases are prioritized using
only the original text. Sources support context about a person, not necessarily
each individual detail of every other source; Why this? states that distinction.

Prepare is manual browsing, not face recognition or an alternate automatic
recall pathway. It never manufactures a face result, retrieval score, confidence
value, recall event, or speech. The recognition gate remains unchanged: minimum
0.85, two distinct supporters, scoped human evidence and contradiction checks.
The latest retrieval calibration from `bf0c5d9` is preserved.

Successful `POST /api/recall` adds `context` with person metadata, named literal
facts, original human source text, supporting contributor names and memory count.
Existing `cueText`, `audio`, `evidence`, `scores`, and terminal persistence remain.
The card is assembled only after SPEAK and grounding validation. Identity and
relationship are visual metadata, not invented additions to the spoken quote.

`GET /api/weaver/preview` is contributor-only and read-only. It returns
`{preview: null | {label, question, targetName, state: "asked" | "suggested"}}`.
Suggestions use deterministic wording; no LLM/provider call, RPC, scheduling,
or question insertion occurs. Existing questions retain their stored wording.

## Shared database protection

No hosted read/write checks, migrations, seed/reset, account changes, provider
calls or real face/recall activity were performed in this sprint. No `.env`
file changed. `scripts/check-services.mjs` was deliberately skipped: it signs
into shared accounts and sends a request to the face service.

`scripts/offline-check.mjs` supplies process-only empty server credentials and
a `.invalid` browser fixture origin; it preloads a non-local fetch/socket blocker
in child Node processes. Browser tests intercept Auth and data, reject all
unmocked API/external requests and close WebSockets. Port 3197 is a separate local
test server; an existing server is never reused. The offline build is verification
output with fixture public configuration, not a deployable production build.

```powershell
node scripts/offline-check.mjs test
node scripts/offline-check.mjs types
node scripts/offline-check.mjs lint
node scripts/offline-check.mjs build
node scripts/offline-check.mjs browser --workers=2
```

## Demo path

1. Open `/prepare` as Rosa or a contributor, select Nora, and read the short
   literal quote beneath her recorded relationship. No camera is needed.
2. Expand More context and Why this?; View source in Atlas opens that memory.
3. Existing recognition continues through `/wearer`. With sufficient evidence,
   Nora's name/relationship and a named quote appear. With insufficient evidence,
   the previous cue clears and Kin remains silent. Do not run new recognition
   against the shared project during the read-only sprint.
4. Family shows a suggested gap without creating a question. The existing,
   separately authorized Stage → Run Weaver → David answer path still ingests
   the literal Italy/recipe answer and updates the graph. No automatic trigger
   was added, and the threshold was not lowered to force a demo.
5. `/today` revisits already recorded camera checks; it does not claim that
   anyone actually met or discussed a topic, and has no save-as-memory control.

## Deferred trust work

Per-person enrollment deletion is not shipped. The existing enrollment receipt
is idempotent: deleting only a descriptor could leave a successful receipt that
prevents intentional re-enrollment. A future change should atomically revoke an
enrollment and its replay behavior, authorize the family/admin, preserve source
memories and avoid a pending retry restoring it. Model consent as the contributor's
permission confirmation, never verified legal consent. No schema workaround or
Reset/Seed-based deletion was introduced.

Remaining limits: denial detection is conservative keyword matching, not general
contradiction inference; recorded relationship fields can be incomplete; semantic
face/voice/TTS and live concurrency still require separate authorized device and
hosted validation. Prepare reloads on entry/retry rather than subscribing live.

## Final verification

195 unit/route tests, TypeScript, lint and production build pass. All 44 browser
tests pass with offline guards. Prepare passed serious/critical axe checks at
375 and 1440 pixels; phone Prepare and recall screenshots were visually inspected.
Existing webpack cache-snapshot warnings remain non-fatal. No live backend or
provider validation was attempted. Full results and initial failures/fixes are
in AI_BUILD_LOG.md.
