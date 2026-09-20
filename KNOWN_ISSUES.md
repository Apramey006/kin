# Current product sprint status — 2026-09-20

This update supersedes the historical planning findings below; those findings are preserved for context. See [product sprint](docs/product-sprint.md) for the implementation and safe demo path.

- RESOLVED before this sprint: server face path, bearer sessions/family RLS, atomic ingestion, canonical seed/reset membership behavior, threshold >= 0.85, two distinct contributors, literal fact grounding, terminal SILENT persistence, and self-contribution review. Migrations 001–007 exist locally. Their hosted state was not inspected this sprint.
- RESOLVED this sprint: no proactive briefing, anonymous attribution in wearer cues, missing optional provenance UI, camera-only product entry, absent reflection view, and disabled pinch zoom. Prepare, named recall cards, source links, read-only gap preview and Today are implemented.
- TEST DRIFT repaired: bf0c5d9 changed the similarity calibration and added subject lookup without matching fixture/expectation updates. Tests now cover that committed calibration and subject metadata; no production scores or gate policy were changed to pass tests.
- OPEN: no per-person enrollment revocation workflow; receipt/retry semantics need atomic design. Permission is a contributor confirmation, not verified legal consent.
- OPEN: explicit-denial detection is heuristic; relation fields are recorded metadata; live face/voice/TTS quality and device behavior require separately authorized validation.
- READ-ONLY SPRINT: no hosted actions or provider/service checks performed; all verification uses offline guards, mocks and local fixtures. Never run hosted seed/reset/provisioning or the service checker merely to test this change.

---

# Historical readiness review (superseded)

# Current readiness

Planning review 2026-09-19: source HEAD `3d4b9a9`, previous audit `18c3376`. Seven commits compared with `git diff 18c3376 HEAD`, latest commit diff, staged/unstaged diffs and current source. At entry the only local change was staged PARALLEL_PLAN.md. Package/lock/schema migration 001/browser clients/seed/synthesis/OpenAI wrapper were unchanged across those commits.

Implementation handoff: GO once this planning checkpoint is reviewed/committed; demo/live acceptance remains NO-GO. The user's latest instructions resolve face-only scope, intended 0.85 threshold and two-contributor policy. Missing credentials/media block live validation, not code integration against the frozen contracts. No backend behavior was changed here.

# Changes Since Previous Audit

| Previous finding / files | Classification | Current evidence and P0 planning effect |
| --- | --- | --- |
| 1. Server descriptors: lib/server-faces.ts, face-service/server.mjs, faces/detect/enroll | PARTIALLY RESOLVES PREVIOUS BLOCKER | HTTP adapter, versioned service and bound selections exist. Package/deploy/test these; do not design another provider. Recall imports the wrong placeholder. |
| 2. Browser dependencies: lib/faces.ts, PhotoUploader, wearer | PARTIALLY RESOLVES PREVIOUS BLOCKER | Enrollment backend no longer imports browser face-api; clients still do. Remove client identity dependency when connecting image uploads. |
| 3. Threshold: lib/gate.ts, lib/config.ts | DOCUMENTATION ONLY / NEW RISK | Added comment rationalizes 0.80 and calls C heuristic. Runtime still 0.80. Comment's claim that narrative 0.85 used an unweighted formula conflicts with design_doc's weighted example and current user policy. Implement 0.85 explicitly. |
| 4. Minimum Keepers: gate/tests | No relevant implementation change | Single-Keeper SPEAK still tested. Latest user policy requires two distinct meaningful supporters; update gate and policy-specific tests. |
| 5. Grounding: ingestion/memory.ts, extract.ts, synthesize.ts | PARTIALLY RESOLVES PREVIOUS BLOCKER | Vision captions separated from human photo extraction; question premises explicitly not evidence; input schemas stronger. Final cue lexical guard unchanged. |
| 6. Recall contract: recall route, tests/recall.test.ts | PARTIALLY RESOLVES PREVIOUS BLOCKER | Finite descriptor validation, replay family scope and failure write attempt added; successful response casing unchanged, no evidence/scores response schema. |
| 7. API_CONTRACT.md | DOCUMENTATION ONLY in this pass | Absent at entry; new current/target contract consolidates implemented ingestion and planned P0 integration. |
| 8. KNOWN_ISSUES.md | DOCUMENTATION ONLY in this pass | Absent at entry; this file records current rather than inherited findings. |
| 9. Fixtures: demo/ | No media change | No directory at entry or equivalent real images/audio. Manifest added this pass; media still absent. |
| 10. Seed: lib/seed.ts | NEW RISK from integration | Still three memories/no faces. Nested content-addressed storage and auth-bound contributor IDs now expose reset/seed incompatibilities. |
| 11. Supabase access: ingestion/auth.ts, proposal SQL | PARTIALLY RESOLVES PREVIOUS BLOCKER | Verified bearer + admin claims + relative lookup on five routes, service-only proposal RPC. Reads/media/admin/recall/Weaver remain legacy/open. No production auth rewrite needed. |
| 12. Answer idempotency: ingestion/persist.ts, memory.ts, proposal SQL/tests | PARTIALLY RESOLVES PREVIOUS BLOCKER | Stable operation IDs, receipt reuse/conflict checks and transactional answer transition implemented/tested with mocks. Proposal not in migration chain; actual pgvector deployment unverified. |
| 13. Failure terminal state: recall route/tests | PARTIALLY RESOLVES PREVIOUS BLOCKER | Catch attempts terminal SILENT and missing subject handled. Supabase error objects often ignored; gate may remain SPEAK while event becomes SILENT. |
| 14. Stage: stage/page.tsx, e2e/stage-actions.spec.ts | NEW CAPABILITY | Guards overlapping actions, surfaces HTTP/network errors, confirms reset, handles missing replay. Keep this work; add question/target and accurate terminal display. |
| 15. Mobile: faces routes, ingestion | NEW CAPABILITY / REGRESSION | Mobile HTTP transport exists. Old Family/Weaver clients have no bearer header, no sent consent, and use now-rejected raw enrollment descriptors. Client-to-backend contract broken. No native app. |
| 16. Tests: four new unit files, Keeper additions | PARTIALLY RESOLVES PREVIOUS BLOCKER | Fresh 82 tests in 9 files pass (previous 27/5). Mocked route/provider/encryption coverage substantial; real closed-loop evidence still absent. |
| 17. E2E setup: stage-actions tests | NEW CAPABILITY; environment blocker persists | Nine Stage tests added to four smoke tests. Browser binary still missing in this environment. No browser behavior pass claimed. |
| 18. OpenAI: providers/openai.ts, extract.ts | PARTIALLY RESOLVES PREVIOUS BLOCKER | API wrapper/models unchanged, extraction guardrails strengthened. Keep API style; improve factual evidence and timeouts instead of migrating SDK/API. |

Commit map: 38a9874 Stage UI; 00333af recall hardening; 24d301e recall concurrency; da12155 atomic foundations; ad29c66 server enrollment; 6054779 ingestion hardening; 3d4b9a9 handoff documentation. No unrelated feature work needs preservation in P0 just because it appeared in the old plan.

## Ranked remaining defects

### BLOCKER for a working P0 demo

- **Disconnected face paths:** recall imports `lib/faces-server.ts`; nothing registers its adapter. Enrollment uses `lib/server-faces.ts`. Snapshot-only recall swallows inference failure; raw client descriptors remain trusted. No model eligibility check in face RPC/replay. Real service dependencies sharp/tfjs-node and service lockfile absent.
- **Persistence deployment gap:** normal setup applies only 001; authenticated ingestion requires ingestion_receipts/commit_ingestion from a proposal under docs. Expect 503 without integration. Do not restore independent writes as a shortcut.
- **Client regression:** Family, PhotoUploader and WeaverInbox still send legacy requests. With configured Supabase, missing token yields 401; adding token alone does not supply required photo consent/temp face selection. No login/demo-session connection in these clients.
- **Policy gap:** runtime is 0.80/one Keeper. Intended 0.85/two distinct meaningful supporters/explicit enrolled face/ambiguity rejection are not implemented.
- **Cue facts:** lexical validation allows unsupported lowercase assertions and first-word names; corpus includes unrelated family nodes; fallback assumes wearer participation. Recall ignores `cue.grounded`. Human-source separation during ingestion improves provenance but does not solve cue entailment.

### HIGH

- Fast path discards semantic retrieval after 700 ms. With all R=0, even V=A=S=1 yields C=0.70: cannot pass either threshold. Timeout can change output solely with provider latency; new tests verify speed, not useful final SPEAK. Do not invent R or lower gate to mask this.
- R is not necessarily about claimed subject; weak rejected face can still control citation pool after semantic fallback. Family-wide top-five face candidates can exclude another contributor before filtering. Owners are assumed in the DB assembly path. Two-Keeper policy must use actual contributor memory support, not require two copies of the same enrollment image as independent facts.
- Best-effort terminal writes ignore Supabase `{error}`. Missing-subject/failure can leave stored gate.decision=speak while status=silent; GateMeter reads gate decision. New concurrent SPEAK event write measures latency before TTS completes, unlike returned latency.
- Public media/permissive SELECT remain, as do unauthenticated admin/recall/Weaver run/TTS. Replay now scopes configured family but still lacks session authorization. Protect the demo, without production SaaS scope.
- Reset lists only one storage prefix level, but ingestion now writes family/contributor/memory/hash. Seed regenerates contributor UUIDs, invalidating provisioned auth claims. Integrate receipt reset semantics and membership reprovisioning.
- Weaver can duplicate open gap questions. An answer can mark a question answered without producing the selected tradition's origin edge; current mocked answer fixture links Nora taught_by mother, which alone does not close the tradition gap. Need full graph/recall integration test.
- No actual enrolled/match/unknown/audio fixtures, live provider/DB integration, or device verification.

### MEDIUM / P1

- Enrollment receipt retry checks selection expiry first; redetection required after expiry. Clarify behavior in clients.
- OpenAI timeout wrapper does not cancel requests; embedding call has no explicit application timeout. ElevenLabs wrapper does not abort or bound the full body read. Deepgram now uses AbortSignal.timeout and redacts provider bodies: retain that fix.
- Stage lacks question/target display; stale event remains after empty/reset fetch; provenance-only updates have no subscription. Browser audio/camera cancellation remains incomplete.
- KIN_FAMILY_ID is server-only but used by browser shared config; custom family can diverge. Seed's custom env parser preserves inline comments (example fixed this pass, parser not changed).
- Health is statically prerendered and only checks key presence/Supabase, not providers. Root manifest has no typecheck script. .gitignore now also ignores plain .env; no secret values were displayed.
- Model assets include unused age/gender/expression/tiny networks; removing unused assets is IRRELEVANT TO P0, optional later.

## Current OpenAI audit

| Capability | Current use |
| --- | --- |
| Image/context understanding | captionImage, Chat Completions image content; explicit no identity prompt. Used in photo ingestion and recall. |
| Structured memory extraction | Chat Completions strict JSON schema plus Zod; strengthened source/question rules in extract.ts. |
| Embeddings | Embeddings API; default text-embedding-3-small, 1536-d storage contract. |
| Keeper reasoning | No per-Keeper LLM call. Deterministic contributor/face/vector retrieval and scoring; semantic query depends on OpenAI caption embedding. |
| Weaver ranking | Deterministic graph candidate score and relative ranking, not OpenAI. |
| Weaver question | chatJSON phrases selected gap/evidence; deterministic fallback exists but lacks gap-specific wording. |
| Cue synthesis | chatJSON rewrite of supporting summaries, followed by weak lexical guard/template. |

Default chat model gpt-4o; override OPENAI_MODEL. API remains Chat Completions with response_format json_schema strict:true, plus embeddings.create. chatJSON retries all caught failures once; outer withTimeout is not cancellation. No provider abstraction interface, but wrapper functions are module-mocked; synthesis accepts injected rewrite. Keep working API style in this task.

OpenAI's substantive role is turning human narration into graph/searchable facts, semantic retrieval, and evidence-constrained phrasing. Keep face identity, gate, candidate/routing decisions and idempotency deterministic. Photo caption is non-factual context yet currently required for ingestion success; consider making it optional. Face-only recall need not always caption an image once trusted identity supports person-scoped retrieval; evaluate latency without removing useful semantic context or inventing support. No live provider capability claims are made.

## Fresh verification

Node 22.19.0 / npm 10.9.3. Exact commands run from kin:

- `npm.cmd ci --no-audit --no-fund`: initial sandbox run failed EPERM in user npm cache; approved unsandboxed retry succeeded, 502 packages. No package/lock changes.
- `npm.cmd run`: inspected scripts; no typecheck script.
- `node_modules\\.bin\\tsc.cmd --noEmit --incremental false`: PASS.
- `npm.cmd test`: PASS, 82 tests / 9 files; Vite config-loader future-warning only.
- `npm.cmd run lint`: PASS, no lint warnings/errors.
- `npm.cmd run build`: PASS; face-api dynamic-require and webpack snapshot-cache warnings. /api/health static.
- `node --check face-service/server.mjs`: PASS syntax only.
- Required face manifests/binaries match installed locked face-api 1.7.15 assets. sharp and @tensorflow/tfjs-node are NOT installed; no inference runtime success claimed.
- `npm.cmd run test:e2e`: 13 tests attempted, all fail at browser launch; missing `chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe` in the configured ms-playwright cache. No page behavior executed. The lingering runner was interrupted after collecting all launch failures. Install via `npx playwright install chromium`, then rerun.

No .env.local; required provider/Supabase/face-service env variables unset. No configured safe DB and no psql command available: no SQL integration run this pass. The ingestion handoff reports a prior local PostgreSQL test using JSON/text in place of vectors; that is not current real-pgvector verification. No LIVE PROVIDER VERIFIED or DEVICE VERIFIED result. No binaries were fabricated.
