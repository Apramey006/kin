# Current product additions — 2026-09-20

The earlier CURRENT/TARGET tables below describe a historical planning checkpoint, not today's auth or gate behavior. The integrated app now verifies family membership, uses literal human facts, and enforces >= 0.85 plus two independent supporters.

- GET /api/prepare: authenticated family-only, read-only, private/no-store; optional person UUID. Returns ready/insufficient/disputed briefings with exact named facts and graph relationship metadata. No event, audio, RPC or model invocation.
- POST /api/recall: existing request and terminal behavior preserved. SPEAK adds context (person, facts, supporters, memoryCount, mode) for visual display; cueText/audio stay exact, attributed and short. SILENT carries no context.
- GET /api/weaver/preview: authenticated non-self contributor, read-only, private/no-store; suggested/existing gap and likely relative. Never creates a question.
- /today reads family-scoped recall_events and graph_nodes under existing RLS; no new API or saved interaction is implied.

See [current detailed contract and limitations](docs/product-sprint.md). No migrations or hosted changes were performed in this sprint.

---

# Kin API contract

Checkpoint `3d4b9a9`, 2026-09-19. CURRENT means implemented, not live verified. TARGET P0 freezes future implementation; do not present it as already available. Preserve endpoint names and response casing.

## CURRENT: authenticated ingestion

Five POST routes require `Authorization: Bearer <Supabase access token>`: faces/detect, faces/enroll, memories/photo, memories/story, weaver/answer. Supabase auth.getUser verifies the user; admin-managed app_metadata `kin_family_id` and UUID `kin_contributor_id` must match an existing relative. Submitted contributor_id and optional family_id must match. User metadata is not authorization.

Errors are `{error:string}`: 400 malformed/consent, 401 session, 403 scope, 404 question, 409 retry/answered conflict, 413 size, 415 MIME, 422 media/no speech/selection, 502 provider/persistence, 503 missing prerequisites. Other routes remain unauthenticated and use a different error helper. Face-service busy/errors are currently mapped to 502 by the adapter.

Maximum file size 15 MiB. An ingress body limit is also necessary because formData buffers chunked bodies. Image signatures: JPEG/PNG/WebP. Audio: WebM, MP4/M4A, WAV, Ogg, MP3, AAC and MIME aliases in lib/ingestion/http.ts. Signature validation is not complete decoding. Convert HEIC before BOTH detection and upload.

| Route | Request | Response |
| --- | --- | --- |
| POST `/api/faces/detect` | Multipart file | `{faces:[{temporaryFaceId,box:{x,y,width,height}}]}` |
| POST `/api/memories/photo` | Multipart file, contributor_id, optional caption, labels JSON; consent="true" for nonempty labels | MemoryResult; persons resolves label indices |
| POST `/api/faces/enroll` | JSON memory_id, contributor_id, person_node_id, temporaryFaceId, consent:true; optional family_id | `{ok:true,face_id,model}`; raw descriptor rejected |
| POST `/api/memories/story` | Multipart file, contributor_id | MemoryResult |
| POST `/api/weaver/answer` | Multipart file, contributor_id, question_id | MemoryResult; assigned contributor only |

Photo label is `{person_node_id}` OR `{new_person:{name,relation_to_wearer}}`, optionally box. Box is annotation, not biometric selection. Encrypted selection IDs expire after 15 minutes and bind model, descriptor, image bytes, family and contributor. Detection/upload must use identical bytes. Current enrollment checks token validity before receipt lookup; an expired retry requires redetection of the same image.

```ts
type MemoryResult = {
  memory_id:string; media_path:string; transcript:string|null;
  caption:string|null; summary:string;
  entities:{label:string;type:string;relation_to_wearer:string|null}[];
  persons:{index:number;node_id:string}[];
};
```

Photo/story accept Idempotency-Key. Without it, identical media/fields deduplicate per contributor. Changed input with the same key returns 409. Answers use question identity; matching retries return original response, changed audio conflicts. Concurrent provider work can repeat; proposed SQL commits one operation. Requires ingestion_receipts/commit_ingestion, only proposed in docs/agent-2-ingestion-migration.sql. Storage precedes SQL and failed commits may leave an orphan; avoid deleting objects referenced by concurrent retries.

Photo fact extraction uses human caption/labels, not the vision caption. Audio uses transcript. Source/consent metadata is preserved in proposed private receipts. Structural validation still does not prove extracted statements true.

## CURRENT: recall and legacy routes

POST `/api/recall` accepts multipart optional snapshot plus JSON-string faceDescriptors (arrays of 128 finite numbers), or JSON replayEventId. It uses configured FAMILY_ID, not a session. Replay filters family but trusts unversioned saved descriptors. Snapshot-only processing invokes the unregistered lib/faces-server.ts placeholder; its error is swallowed.

```ts
type CurrentRecall =
 | {decision:"speak";eventId:string;cueText:string;
    audio:string|null;latencyMs:number}
 | {decision:"silent";eventId:string;reason:string};
// Audio is base64 MP3; null requests client speech fallback.
// Non-2xx errors use {error:string}.
```

| Endpoint | CURRENT behavior |
| --- | --- |
| GET `/api/recall` | `{lastEventId:string|null}` |
| POST `/api/tts` | `{text}` with nominal 300-character bound; binary audio/mpeg; incomplete runtime type validation |
| POST `/api/weaver/run` | `{question,gap}`; null question can mean no gap or no target, despite shared message |
| GET `/api/health` | Config booleans and Supabase query; no provider verification; static prerender risk |
| POST `/api/admin/seed`, `/api/admin/reset` | Unauthenticated demo mutations |

Wearer/relatives/people/memories/questions/events/graph reads currently use Supabase directly. No family/bootstrap or memory/question collection GET APIs exist. Authorized scoped Supabase reads can remain; new routes are not mandatory.

## TARGET P0: face interface

Use existing `lib/server-faces.ts` `detectFaces({bytes:Buffer,mime:string}) -> Promise<{box,descriptor:number[]}[]>`. Exact 128 finite values, internal only. Keep FACE_MODEL:

`face-api-1.7.15:ssd-mobilenetv1:landmark68:recognition128:rgb-exif-v1`

Same service/weights for enrollment/recall: EXIF orientation, white alpha flattening, sRGB RGB integer tensor, no resize, SSD confidence 0.5, full landmark68. Keep a version/weight eligibility check against trusted stored source metadata; legacy rows/replays do not qualify merely by dimension. More than one detected face is ambiguous in P0. Calibrate distance/runner-up margin on actual fixtures; do not force a nearest match.

```ts
type FaceOutcome =
 | {status:"matched";subjectNodeId:string;model:string;
    enrollmentIds:string[];distance:number;v:number}
 | {status:"no_face"|"unknown"|"ambiguous"|"unavailable";model:string};
```

## TARGET P0: evidence, Keeper and gate

```ts
type Evidence = {
  memoryId:string;contributorId:string;subjectNodeId:string;
  source:"human";supportedFacts:string[];
};
type TargetKeeperResult = {
  keeperId:string;claim:{subjectNodeId:string;label:string}|null;
  memoryIds:string[];v:number;r:number;reason:string;
  support:"supports"|"contradicts"|"abstains";evidence:Evidence[];
};
type Scores = {V:number;R:number;A:number;S:number;X:number;C:number;threshold:number};
type ReasonCode = "no_face"|"unknown_face"|"ambiguous_face"|
 "insufficient_evidence"|"contradiction"|"no_provenance"|
 "below_threshold"|"provider_failure"|"grounding_failure"|"speak";
```

Each supported fact must resolve to human source spans or explicit human relationships; a model-generated assertion alone is insufficient. Keepers retrieve their own contributor's evidence about the trusted matched person. Verify persisted ownership and subject links; count each contributor once. No semantic-only identity or fabricated fast-path R.

Gate inputs: trusted FaceOutcome, distinct Keeper results, verified human source/subject provenance, material contradiction and grounding-critical failure flags. Output retains GateResult fields (Scores, decision, reason, subjectNodeId, agreeingKeeperIds, citedMemoryIds) plus reasonCode. KIN_GATE_THRESHOLD default 0.85. At least two meaningful distinct supporters is a separate hard requirement. Score is heuristic; no high score overrides unknown face, critical failure or unsupported facts.

## TARGET P0: recall lifecycle

```ts
type TargetRecall =
 | {decision:"speak";eventId:string;cueText:string;audio:string|null;
    evidence:Evidence[];scores:Scores;latencyMs:number}
 | {decision:"silent";eventId:string;reason:string;
    reasonCode:Exclude<ReasonCode,"speak">;scores:Scores|null;latencyMs:number};
type ApiError = {error:string;code:string};
```

Keep multipart `snapshot`, validated JPEG/PNG/WebP, size/signature bounds; client descriptors ignored for identity and removed from clients. Family derives from verified demo session. Keep replayEventId; reprocess stored image if descriptor version is unverified. SILENT has no cue/audio. Scores are null if scoring never became possible. Malformed/auth requests use non-2xx ApiError. After event creation critical processing failure becomes terminal SILENT when persistence is available; DB outage returns explicit failure, not a false success. Persist consistent gate/status; check error objects. TTS-only failure may return grounded cueText/audio:null. Client cancels previous audio on capture/SILENT/unmount.

## TARGET P0: Weaver candidate/question/answer

```ts
type WeaverCandidate = {
 candidateId:string;type:"missing_origin"|"orphan_object"|"unrelated_person";
 nodeId:string;evidenceMemoryIds:string[];score:number;
 rankedTargets:{contributorId:string;score:number;reason:string}[];
};
```

Retain WeaverQuestionRow names: id, family_id, target_relative_id, gap_node_id, gap_type, question_text, evidence, status, answer_memory_id, created_at. Evidence retains memory_id/contributor_id/summary. Add run reason created/existing_open/no_gap/no_target while preserving question/gap keys. Persist one open question per family/gap; retain deterministic ranking. Keep existing audio/receipt answer contract. The answer must close the selected relationship gap, not merely mark answered. Question premises are not human evidence.
