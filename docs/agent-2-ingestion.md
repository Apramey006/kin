# Agent 2 ingestion handoff

## Status and deployment blockers

The Next.js handlers, mocked provider tests, and disposable PostgreSQL transaction
checks pass. Live inference and Supabase persistence are **not yet verified**. The installed Node face-api entry
fails immediately with `Cannot find module '@tensorflow/tfjs-node'`; neither
`canvas` nor `sharp` is installed. The Next.js runtime therefore uses an HTTP
adapter, with no native face-api import. This is the supported fallback requested
for incompatible server tooling.

Agent 4 must review and apply `docs/agent-2-ingestion-migration.sql` as a new
migration. It is a proposal, deliberately outside `supabase/`; no shared schema,
config, dependency manifest or lockfile has been changed by Agent 2. Without this
migration ingestion returns 503. A series of independent PostgREST writes cannot
guarantee atomic graph/memory/question updates, so there is no unsafe fallback.

## Agent 4: exact integration requests

1. Review the proposed migration: service-role-only `commit_ingestion(payload
   jsonb) returns jsonb`, and private `ingestion_receipts` holding a request hash,
   stored response and human-source/consent metadata. Commit memory, graph,
   provenance, optional face, question status and receipt in one transaction.
2. Replace the small `authenticateIngestion(request, supabase)` boundary in
   `lib/ingestion/auth.ts` with the shared auth helper when available. It must
   return `{ userId, familyId, contributorId, contributor }`, with current verified
   family membership and contributor ownership. Currently it verifies the Bearer
   token via Supabase `auth.getUser(token)`, then reads **admin-managed
   app_metadata** `kin_family_id` and `kin_contributor_id`, and verifies that the
   relative exists in that family. Never populate these claims from user_metadata.
   Revoking membership requires clearing the admin claims or deleting the relative.
3. Add deployment secrets below and enforce the multipart body limit at the proxy
   (15 MiB media plus 64 KiB multipart overhead). `Request.formData()` buffers the
   body, so the application file-size check alone does not bound a chunked request.
4. Deploy the inference process with its own dependencies, outside the Next bundle:
   `@vladmandic/face-api@1.7.15`, `@tensorflow/tfjs-node@4.22.0`, and `sharp`.
   Pin the tested sharp version in that service's lockfile. Use a supported Linux
   CPU container and verify native TensorFlow loading before demo deployment.
   No root dependencies were added. Service startup loads all three models and
   fails if its runtime or weights are unavailable.
5. Existing public media and permissive read RLS from migration 001 still need the
   shared auth/schema work. The new receipt table has RLS and no anon read policy.

## Agent 3: shared face adapter

Import `detectFaces`, `extractFaceDescriptor`, and `FACE_MODEL` from
`lib/server-faces.ts`, never from the browser `lib/faces.ts`.

`await detectFaces({ bytes: Buffer, mime: string })` returns internal
`{ box, descriptor }[]`. Use these server descriptors in recall and fail silent
on inference/model errors. Ignore any client-provided descriptors. Enrollment
uses `extractFaceDescriptor(image, temporaryFaceId, { familyId, contributorId })`
to decrypt the exact descriptor generated during detection, bound to the same
image bytes and identity. It does not redetect and guess which box was selected.

Both enrollment and recall must call the **same service deployment and weights**:
`face-api-1.7.15:ssd-mobilenetv1:landmark68:recognition128:rgb-exif-v1`.
The model identifier fixes face-api 1.7.15 SSD MobileNet v1, full 68-point
landmarks, the 128-dimensional recognition model, minConfidence 0.5, EXIF
auto-orientation, white alpha flattening, sRGB, no resizing, RGB integer tensors.
Do not compare other 128-dimensional models merely because their lengths match.
Start with a fresh enrollment set; legacy browser rows do not record a verified
pipeline version. Replay events also need Agent 3's matching model tag; reject
legacy/unversioned replay descriptors. If model weights change, change the model
identifier in both adapter and service and re-enroll faces.

No shared OpenAI wrapper change is required. Current calls remain
`captionImage(bytes, mime)`, `embedText(text)` and `chatJSON(options)`.

## Agent 1: mobile contracts

All five POST endpoints require `Authorization: Bearer <Supabase access token>`.
Family is derived from the session; optional `family_id` must match. UUID fields
must be valid UUIDs. Errors use `{ error: string }`, with 400 malformed input or
missing consent, 401 unauthenticated, 403 scope mismatch, 409 retry-content
conflict, 413 size, 415 MIME, 422 invalid media/no speech/expired selection,
502 provider/storage/commit failure, and 503 missing deployment prerequisites.

1. `POST /api/faces/detect`: multipart `file`, JPEG/PNG/WebP. Returns exactly
   `{ faces: [{ temporaryFaceId, box: { x, y, width, height } }] }`. No faces is
   a successful empty array; multiple faces remain separate. Boxes use pixels in
   the EXIF-oriented image; display the original with that orientation. IDs expire
   in 15 minutes and are opaque encrypted strings. No raw embedding goes to mobile.
2. `POST /api/memories/photo`: multipart `file`, `contributor_id`, optional
   `caption`, `labels` JSON array. Labels are either `{ person_node_id }` or
   `{ new_person: { name, relation_to_wearer } }`; optional pixel `box` is accepted
   as an annotation, never used for biometric selection. `consent="true"` is
   required when labels are present. Returns `{ memory_id, media_path, caption,
   summary, entities, persons: [{ index, node_id }], transcript: null }`.
3. `POST /api/faces/enroll`: JSON `{ memory_id, contributor_id, person_node_id,
   temporaryFaceId, consent: true }`. Use the selected detect ID and the matching
   photo's memory ID. The original photo must be uploaded byte-for-byte, without
   re-encoding between detect and ingestion. Returns `{ ok: true, face_id, model }`.
   Client `descriptor` fields are rejected. Detection is transient; explicit
   consent is required before any descriptor is persisted.
4. `POST /api/memories/story`: multipart `file`, `contributor_id`.
5. `POST /api/weaver/answer`: same audio fields plus `question_id`. Only the
   assigned contributor can answer. The original question is passed to extraction
   for pronoun resolution, but its premise is not treated as a human assertion.
   Story/answer responses contain `{ memory_id, media_path, transcript, summary,
   entities, persons: [], caption: null }`.

Audio accepts WebM (including codec parameters), MP4/M4A, WAV, Ogg, MP3, AAC.
Container signatures and nonempty content are checked before transcription;
Deepgram handles full audio decoding. Images support JPEG/PNG/WebP signatures;
the face service performs actual decoding and limits pixels to 24 million. HEIC
must be converted on mobile before both detection and upload.

Send a stable `Idempotency-Key` header for photo/story retries. Without one,
the server deduplicates identical media and fields per contributor. Different
content with the same key returns 409. Weaver uses the question as the logical
operation key; retrying with changed audio returns 409 after completion. Receipts
return the original response before calling providers again. Concurrent calls
can repeat provider work but commit only one logical memory.

Vision captions are stored separately; only the family's caption and labels are
fed into photo fact extraction. The model cannot identify people from appearance.
Original transcript/media, contributor, human caption/labels, question context,
consent, and graph provenance are retained. No zero-vector fallback is used.

## Face service deployment

`face-service/server.mjs` is a runnable reference process once Agent 4 installs
its native dependencies. Run from the repository root with `node
face-service/server.mjs`. It defaults to loopback port 8100. Set `KIN_FACE_BIND`
only when deploying behind a private authenticated proxy. It handles one
inference at a time and returns 503 while busy. Protect it with HTTPS outside a
single host; do not expose model descriptors publicly.

Server-only environment:

- `KIN_FACE_SERVICE_URL`: full URL ending `/detect`, e.g. `http://127.0.0.1:8100/detect`.
- `KIN_FACE_SERVICE_TOKEN`: shared random secret for Next and the service.
- `KIN_FACE_TOKEN_KEY`: separate random 32-byte key encoded as 64 hex characters;
  same value on all Next instances. Rotation invalidates pending selections.
- Service-only `KIN_FACE_WEIGHTS`: default `public/models`; deploy the shipped
  1.7.15 weights identically for enrollment and recall. `PORT` defaults to 8100.
- Existing Supabase service credentials, Deepgram and OpenAI configuration remain
  server-side. Embeddings must be the current 1536-value repository contract.

Upstream native runtime reference:
https://github.com/vladmandic/face-api/blob/master/README.md

## Verification and limits

`npm test` passes 74 tests; `npm run lint`, `npx tsc --noEmit --incremental false`,
and `npm run build` pass. Build retains the existing browser face-api dynamic
require warning in `lib/faces.ts`, outside Agent 2 ownership. `node --check
face-service/server.mjs` passes syntax validation only.

Tests use real Web `Request`, `FormData`, `Blob`, encryption and validation with
mocked providers/Supabase. They verify mobile transport, scopes, failure paths,
question context, and the transaction adapter contract. They do not prove live
Deepgram transcription or real face quality.

`tests/ingestion-transaction.sql` passed on an isolated local PostgreSQL 18 cluster:
injected graph failure rolls back memory, graph and receipt; the question remains
open; a successful answer commits; retries return the receipt; changed content
conflicts; missing face consent fails; face retries deduplicate; public roles
cannot invoke the RPC. This fixture substitutes JSON-checked text for pgvector
because the extension is not installed locally. It verifies real SQL transactions,
not production vector casting. Run only in a **new disposable database** with
`psql -v ON_ERROR_STOP=1 -f tests/ingestion-transaction.sql`; it creates test roles
and tables. The test cluster used during implementation was stopped afterward.
Before demo deployment, run the proposal against a disposable Supabase project
with real pgvector and the current shared schema.

Storage upload precedes the database transaction and uses an immutable,
content-addressed path. Failed database commits may leave an unreferenced object;
retries reuse it. Do not immediately delete it on failure, since a concurrent
successful retry may reference it. A later orphan cleanup can remove unused
objects. Provider work is bounded by provider timeouts but is not leased across
instances. Shared membership revocation, legacy data migration, authenticated
reads, and recall integration belong to the corresponding agents.

## File inventory

Changed existing files:

- `app/api/memories/photo/route.ts`
- `app/api/memories/story/route.ts`
- `app/api/faces/enroll/route.ts`
- `app/api/weaver/answer/route.ts`
- `lib/extract.ts`
- `lib/providers/deepgram.ts`

Added files:

- `app/api/faces/detect/route.ts`
- `lib/server-faces.ts`
- `lib/ingestion/auth.ts`
- `lib/ingestion/http.ts`
- `lib/ingestion/ids.ts`
- `lib/ingestion/memory.ts`
- `lib/ingestion/persist.ts`
- `face-service/server.mjs`
- `tests/ingestion.test.ts`
- `tests/server-faces.test.ts`
- `tests/ingestion-providers.test.ts`
- `tests/ingestion-transaction.sql`
- `docs/agent-2-ingestion.md`
- `docs/agent-2-ingestion-migration.sql`

The pre-existing `package-lock.json` working-tree modification was left untouched.
