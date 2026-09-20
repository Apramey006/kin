# Integration verification

This record covers the full `feature/pull-apart-stories` interface integrated
with main, including the concurrent Living Stories merge at `35861ca`. Main already contained cherry-picked story-scene commits,
but its surrounding interface was still the older version.

## Merge boundary

The integration preserves main's inference service, sealed face enrollment,
atomic ingestion, 0.85/two-Keeper gate, latest retrieval scoring, human fact
extraction, Memory Atlas, personal recordings/review, canonical demo provisioning,
Living Stories with timed audio, and Rust sources. Account/session adapters connect the redesigned screens to
those contracts. The feature branch's older recognition/provider implementation
is not substituted for main's newer backend.

Migrations 009 and 010 add accounts and invitations after main's 001–008. They
backfill existing memberships without resetting memories, bridge new loved-one
accounts to personal recording, and prevent direct biometric reads. Apply them
to a main-schema database before deploying this interface. No shared database
migration, seeding, account deletion, or purge was performed during this merge.

## Automated checks

- 210 unit/mocked-route tests pass, including cookie/bearer authorization,
  cancellation of stale audio fallback, and source deletion/receipt invalidation.
- 25 disposable database checks pass using PostgreSQL WASM and real pgvector:
  atomicity, retry behavior, family isolation, self-review, new-family creation,
  loved-one invitation use, descriptor restrictions, and migration reapplication.
- 61 Chromium browser scenarios pass across the redesigned app and Living Stories.
- Typecheck, lint and production build pass. Next's lint command emits its
  deprecation notice; bundling emits existing dependency/cache warnings.
- Rust's three conformance integration tests pass. No Rust source was modified;
  this does not establish parity for every newer TypeScript recall behavior.

Eight initial unit failures reproduced on untouched main. The latest main
retrieval scoring had changed expectations and added a database lookup; test
fixtures now reflect that behavior without reverting main's scoring changes.

Browser verification uses a loopback-only Supabase HTTP double and intercepted
provider/media responses. It exercises actual Next routes, cookies, signup and
onboarding UI, role-based invitations, contribution ownership, photo enrollment
retries, deletion, recording preview, silent recall, Atlas, personal review,
organizer controls, story gestures, keyboard access, large text and accessibility.
SQL policy behavior is tested separately by the database suite; the HTTP double
is not a hosted Supabase/RLS implementation. See README for reproducible commands.

## Checks still requiring real devices/services

- Real iPhone/Safari camera, microphone, gestures and earbud output.
- Confirmation/password-reset email delivery and deployed callback URLs.
- Real face inference against consented enrolled and unknown faces, including
  varied lighting and the intended two-contributor demo.
- The full timed demo with paid transcription, extraction and speech providers.

Automated fixtures do not establish face-recognition accuracy or clinical
suitability. No private credentials, biometric fixtures, or recordings are
included in the integration commit.
