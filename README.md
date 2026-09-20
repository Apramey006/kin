# Kin

**The family remembers together.**

Kin is a trusted family-memory prototype: relatives contribute their stories,
Kin keeps the human sources connected, and a small grounded cue can help someone
find their place in a familiar moment. It is not a medical device and makes no
clinical claims. The phone camera is one prototype trigger, not the product itself.

## Prepare → Assist → Reflect

- **`/prepare` — Before you see them.** Select a person, read one exact family
  memory, and optionally explore more context or its sources. No camera needed.
- **`/wearer` — Help in the moment.** A successful recognition shows the name,
  recorded relationship, and a named contributor's literal quote. Insufficient,
  ambiguous or conflicting evidence leaves Kin silent.
- **`/today` — Look back.** Revisit saved camera matches. These are not proof of
  meetings or conversations; no new memories are automatically created.
- **`/family`** — Contribute photos/stories, answer targeted questions, review
  self contributions and see gaps Kin has noticed.
- **`/graph`** — Memory Atlas, including deep links `?memory=<id>` to source
  memories. `?demo=1` is a separate, explicitly illustrative playback.
- **`/stage`** — Existing judging controls and detailed evidence/gate diagnostics.

See [the product sprint and demo path](docs/product-sprint.md) for architecture,
API additions, validation and follow-ups. The [previous README](docs/history/README-2026-09-19.md)
is preserved as historical context; its old readiness claims are superseded.

## Evidence stays in charge

Recall retains the existing threshold of at least **0.85**, at least **two distinct
supporting contributors**, validated human provenance, and contradiction checks.
A face match alone never authorizes speech. Vision captions and generated
summaries are not verified family facts. Spoken quotes preserve the contributor's
words and pronouns; family names are resolved from their actual membership rows.

Prepare is manually selected browsing, not an alternate recognition gate. It
requires literal human evidence with subject provenance and two contributors;
an explicit dispute withholds the anchor. It creates no event or speech.
Relationships are shown only when recorded, and source details explain their origin.

## Local development

Node 22, Next.js 14, TypeScript, Tailwind, Supabase/Postgres/pgvector, Vitest and
Playwright. Face inference runs separately from Next.js. The UI is mobile web,
not a native app; camera and microphone require a secure browser context.

```powershell
npm ci
npm run dev
```

Use the existing ignored environment configuration and provisioned family
accounts. Never commit keys or passwords. On the shared teammate database,
do not run seed, reset, migrations, provisioning, enrollment or mutating demo
actions during read-only testing. The existing demo's Nora → recall → Weaver →
David answer → graph → later recall path is preserved for separately authorized
rehearsals. No migration is needed for this product sprint.

## Safe offline verification

These commands use empty server credentials, a mock browser origin, a Node
network guard and intercepted browser APIs. They do not modify `.env` files.

```powershell
node scripts/offline-check.mjs test
node scripts/offline-check.mjs types
node scripts/offline-check.mjs lint
node scripts/offline-check.mjs build
node scripts/offline-check.mjs browser --workers=2
```

The last command starts an isolated local test server on port 3197; it never
reuses another running server. Chromium must already be installed. The offline
build is validation output with fixture public settings, not a production build
to deploy or serve with `npm start`. Run normal development for actual app use.

The normal package commands remain available, but hosted service/provisioning
scripts are **not** offline tests. Live biometric accuracy, speech providers,
device audio, and shared-backend concurrency are outside this sprint's verification.
