# Rust handoff

This branch is the runnable TypeScript reference implementation based on
`7cc933c`. It is a separate handoff, not an integration with current main.
See README for setup, VERIFICATION.md for test evidence, and DEMO.md for rehearsal.

## Existing work on main

At review time, `origin/main` was `f91d57d` and already included a Rust `brain/`
with gate, Keeper, and Weaver implementations, conformance fixtures, and an Axum
HTTP service. It also included separate ingestion hardening and server-side face
inference work. Those changes are not included in this branch; merging requires
resolving overlapping route, UI, and core-module changes.

Reconcile these concrete differences before calling the Rust port equivalent:

- Main's Rust gate configuration has no minimum-two-Keepers or ambiguity-margin
  setting. This branch adds both stricter matching and new silent outcomes.
  Regenerate conformance fixtures from the accepted behavior before porting it.
- Main's ingestion auth uses verified bearer tokens plus admin-managed metadata;
  this branch uses Supabase cookies and `family_members` with contributor and
  loved-one roles. Use one membership/authorization source consistently.
- Main's proposed ingestion transaction/receipt migration addresses partial
  writes that remain a limitation here. Integrate it with migrations 003–004
  and the new account/role checks rather than discarding that work.
- Main uses server-produced, model-versioned face descriptors. This prototype
  accepts browser-produced descriptors and does not prove their origin. Preserve
  the stronger inference boundary when integrating; model changes require
  compatible enrollment and replay data.
- Keep this branch's accessible browser flows and response contracts while
  replacing server boundaries incrementally. The existing Rust service is a
  starting point, not evidence that these newer flows are already ported.

## Boundaries

| Area | Reference | Porting responsibility |
| --- | --- | --- |
| HTTP/session authorization | `app/api/`, `lib/auth/server.ts`, `middleware.ts` | Verify Supabase identity and membership on every request; preserve status/body contracts. |
| Keeper retrieval | `lib/keepers.ts`, `lib/enroll.ts` | Validate 128 finite descriptor values; scope by family, contributor, and photo provenance. |
| Gate and cue | `lib/gate.ts`, `lib/synthesize.ts`, `lib/config.ts` | Pure deterministic functions; port unit fixtures first. |
| Extraction and graph | `lib/extract.ts`, `lib/graph.ts` | Validate model output, constrained relations, family-owned endpoints and source links. |
| Weaver | `lib/weaver.ts` | Preserve gap detection, recipient routing, and duplicate-question protection. |
| Deletion | `lib/delete-memory.ts` | Preserve shared evidence and invalidate cached dependent results. |
| External providers | `lib/providers/` | Environment-selected adapters, timeouts, schema validation, no hidden provider fallback. |
| Browser | `app/`, `components/`, `lib/faces.ts`, `lib/audio.ts` | Camera/microphone permissions, face models, accessible UI, audio unlocking, realtime subscriptions. |
| Database | `supabase/migrations/001` through `004` | Apply existing migrations in order; retain Supabase Auth, RLS, Storage and Realtime contracts. |

## HTTP contracts

The route handlers and browser callers are the source of truth for exact JSON
and multipart fields. A separate Rust origin will also need cookie/CSRF/CORS
and reverse-proxy decisions; the current app uses a single origin.

- `GET /api/account`: account and membership. `POST /api/onboarding`: create or
  join a family through transactional SQL functions.
- `POST /api/invite`: owner creates a contributor or loved-one invitation.
  `GET /api/invite`: authenticated invitation preview.
- `GET /api/family`: family data and signed media URLs for authenticated members.
- `POST /api/memories/photo`: multipart photo, labels, consent, contributor ID,
  optional caption. Labels refer to an existing person or name a new person.
- `POST /api/memories/story`: multipart recording and contributor ID.
- `POST /api/faces/enroll`: JSON person, contributor, memory, and descriptor.
  Enrollment must point to that contributor's labeled photo.
- `DELETE /api/memories/:id?contributor_id=…`: delete only the caller's contribution.
- `POST /api/weaver/run`: create a gap question. `POST /api/weaver/answer`:
  multipart recording, contributor ID, and question ID for its intended recipient.
- `POST /api/recall`: multipart face descriptors and optional snapshot, or JSON
  `replayEventId`. Returns a spoken cue with provenance or a silent decision.
  `GET /api/recall` supplies the latest successful event for replay.
- `POST /api/tts`: authenticated speech generation. `/api/health` exposes only
  configuration booleans/provider name and database reachability.
- Legacy HTTP seed/reset endpoints return 410. Do not restore public reset APIs.

## Invariants to preserve

1. Family and contributor come from a verified session, not request parameters.
   Loved-one accounts cannot contribute; only owners create invitations.
2. A person requires agreement from at least two independently scoped relatives.
   Semantic text/image similarity cannot supply identity. Unknown or ambiguous
   faces stay silent. Numeric thresholds live in `lib/config.ts`.
3. Every accepted claim cites the Keeper's own evidence. Context quotes are
   verbatim, attributed, and fit the 30-word cue budget.
4. Deletion removes that memory's face enrollment and invalidates old cues while
   retaining graph facts supported by other contributions.
5. Replaying a known observation retrieves current evidence. A silent attempt
   must never replay cached audio.
6. Loved-one invitations are single-use and one loved-one account is allowed
   per family. Joining must remain transactional under simultaneous requests.

## Suggested sequence

1. Port graph, gate, cue, and Weaver routing using the Vitest cases as fixtures.
2. Implement Supabase session verification and membership checks before exposing
   mutation handlers. Keep service-role credentials entirely server-side.
3. Port provider adapters and HTTP handlers behind the same route contracts.
4. Run the SQL/integration checks and existing Chromium suite against the combined
   frontend/backend. Add Rust tests for authorization and failure recovery.
5. Rehearse DEMO.md on the intended phone before switching the demo to Rust.

## Known prototype limitations

- Ingestion, graph writes, and deletion span several database/storage operations.
  Partial failures can leave incomplete records or orphaned uploads; concurrent
  answers/deletions need transactional claims, idempotency, and compensating
  cleanup. Deletion is retryable but is not an atomic cross-service transaction.
- Family reads are not paginated; large libraries can exceed Supabase row limits.
  Add pagination or purpose-built SQL queries before scaling.
- There is no application rate limiting or provider-spend quota. Recognition
  thresholds have not been calibrated against a representative dataset.
- Recall snapshots/descriptors persist for replay. Define retention, account
  deletion and complete family-export/deletion policies before wider deployment.
- Physical iPhone/Safari testing, real email delivery, and the complete timed
  rehearsal remain manual acceptance work. Automated tests do not establish them.

Credentials belong in `.env.local` or deployment secrets, never in this branch.
The public environment template names the required configuration without values.
