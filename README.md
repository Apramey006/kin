# Kin

Kin brings a family's photos, recordings, and stories together. A loved one can
ask “Who is this?” and hear a short, grounded cue when independent family
memories support it. Otherwise Kin stays quiet. This is a hackathon prototype
for reminiscence support, not a medical device.

## Current app

- **Memories** (`/family`): photos with explicit face labels, previewable voice
  recordings, Weaver questions, and review of a loved one's stories.
- **Living Stories** (`/stories`): main’s continuous, source-attributed listening
  experience, timed passages, topic contributions, and Quiet view.
- **Pull-apart stories**: unfold a shared memory into relatives' perspectives;
  inspect its sources, play original recordings, and answer a missing connection.
- **Recognize** (`/wearer`): camera access on request and one recognition action.
- **Connections** (`/stage`): recall status, evidence, family connections, and replay.
- **Memory Atlas** (`/graph`): main's interactive graph and evidence trails.
- **My recordings** (`/remember`): the loved one's own stories, optionally held for
  family review. Reach it from Recognize.
- **Accounts**: signup, confirmation/reset callbacks, empty-family onboarding,
  contributor invitations, a separate loved-one invitation, and Settings.
  Organizer-only sample/reset tools live in Settings and require an explicit action.

The full interface from `feature/pull-apart-stories` is integrated with main's
server face pipeline, atomic ingestion, two-Keeper evidence policy, and account
provisioning. See [VERIFICATION.md](VERIFICATION.md) for what was tested.

## Run locally

```bash
npm ci
cp .env.example .env.local
# Fill in .env.local, then configure Supabase as described below.
npm run dev
```

Open <http://localhost:3000>. For a production build: `npm run build`, then
`npm start`. Camera/microphone access needs localhost or HTTPS; use an HTTPS
address when testing on a physical phone.

Required configuration is listed in `.env.example`: Supabase URL, browser
publishable/anon key, server secret/service-role key, OpenAI, Deepgram, and
ElevenLabs (including a voice ID). OpenAI supplies extraction, descriptive
captions and semantic embeddings; Deepgram transcribes recordings; ElevenLabs
voices cues, with browser speech as the client fallback. The active backend
uses OpenAI; the earlier feature branch's Anthropic-only mode is not active.

Face recognition additionally needs the separate authenticated inference service
in [face-service/README.md](face-service/README.md), `KIN_FACE_SERVICE_URL`,
`KIN_FACE_SERVICE_TOKEN`, and `KIN_FACE_TOKEN_KEY`. Installing or hosting Next.js
alone does not start that service. Uploads and recall send image bytes; stored
face descriptors never come from the browser. A labeled photo identifies the
person; human memories from at least two distinct Keepers must support a cue.
`KIN_GATE_THRESHOLD` cannot lower the 0.85 minimum. Scores are heuristics, not
calibrated identity probabilities.

## Supabase setup and upgrades

For a **new database**, apply `supabase/migrations/001_init.sql` through
`010_loved_one_invites.sql` in numeric order. For an **existing main database**
with 001–008 already applied, apply only:

1. `009_family_accounts.sql`
2. `010_loved_one_invites.sql`

If 008 has not been applied yet, apply `008_living_stories.sql` first.

These add private family accounts and invitations, backfill existing provisioned
memberships, and connect new loved-one accounts to personal recording/review.
They do not reset memories or accounts. Their reapplication is tested locally.
Do not blindly rerun the earlier migrations or mix in the feature branch's old,
conflicting migration numbers. If your database was created from the older
pull-apart branch (for example, 010 reports that `wearer_accounts` is missing),
run the entire [legacy recovery SQL](supabase/upgrades/pull_apart_to_main.sql)
in Supabase SQL Editor instead. It upgrades that schema through 010 in one
transaction, preserves existing data, and skips demo consolidation. It is also
safe after applying 009 and seeing 010 fail. Sign out and back in afterward.
See [recovery details](supabase/upgrades/README.md).
No hosted database migration or reset is performed by installing/building the app.

In Supabase Auth, enable email/password and configure the app's Site URL plus
`http://localhost:3000/auth/callback` and your deployed HTTPS callback URL as
allowed redirects. Sign up, create a family, then invite contributors or the
loved one from Settings. Confirmation/reset email delivery needs a configured
Supabase mail provider and a physical end-to-end check.

Existing canonical demo accounts remain supported. The optional
`scripts/provision-demo.ts` and `npm run seed` use the real configured database;
read [demo reconciliation](docs/demo-reconciliation.md) before running them.
Seeding is not required for a new family. `/graph?demo=1` displays bundled fictional
Atlas data without accessing a private family's memories.

## Verification

```bash
npm test
npm run lint
npm run build
npx tsc --noEmit --incremental false
npm ci --prefix tests/database
npm run test:db
npx playwright install chromium
npm run test:e2e
cargo test --manifest-path brain/Cargo.toml
```

`test:db` runs disposable PostgreSQL WASM with pgvector. `test:e2e` starts a
loopback-only Supabase HTTP test double on 54329 and Next.js on 3102; it overrides
real credentials and cleans up its servers. Keep those ports free and do not
run another Next.js process in the same checkout during the browser suite.
Pass Playwright filters after `--`. An existing Chromium binary can be selected
with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The browser double tests application
flows, not hosted RLS or real provider accuracy; database rules are checked by
the separate SQL suite.

The Rust service and conformance fixtures in `brain/` remain intact. Next.js
still uses its TypeScript backend; this merge does not switch production recall
to Rust or claim parity for every newer TypeScript behavior. The existing
planning/handoff documents describe earlier checkpoints; current code and this
verification record take precedence.
