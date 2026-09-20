# AI-assisted engineering log

## 2026-09-19: current-source planning pass

Compared audited baseline 18c3376 to current 3d4b9a9 and seven intervening commits. These are observed engineering contributions, not fabricated implementation claims or attribution to a tool that was not used.

- Discovered stale assumption: server enrollment no longer needs to be designed from scratch. Existing HTTP inference adapter/selection tokens should be reused.
- Identified integration mismatch: enrollment uses lib/server-faces.ts while recall imports disconnected lib/faces-server.ts. Revised ownership/dependencies around joining them.
- Identified contract regression: new bearer/consent/temp-ID requirements are absent from existing Family clients. Added explicit client-repair acceptance tests to the plan.
- Distinguished atomic ingestion implementation from deployment: SQL remains under docs, not migrations. Existing route/receipt tests do not prove real Supabase transactions.
- Identified latency/scoring conflict by code inspection: 700 ms fast path can return R=0, whose maximum total is 0.70. Did not lower threshold or fabricate retrieval confidence.
- Rechecked cue grounding: human photo-source separation improved, but final lexical validation and assumed wearer participation remain unsafe. No fix or new regression test is claimed in this planning pass.
- Rechecked failure-state work: recall now attempts terminal SILENT, but unchecked DB errors and gate/status mismatch remain. Did not claim failure-state integration complete.
- Fresh verification: 82 unit/mocked-route tests pass, typecheck/lint/build pass; build retains browser face-api warning. Actual face service, provider, DB and device behavior not live verified.
- Rewrote PARALLEL_PLAN, created current/target API_CONTRACT, KNOWN_ISSUES and missing-media manifest, and clarified setup/policy docs. No backend refactor, model/API migration, production auth or invented media.

Potential sponsor demonstration: show the two differently named face adapters, the incompatible client request, and the revised integration task/test that catches it once implemented. The concrete accomplishment today is detecting and specifying the repair, not claiming it was already repaired. No Devin run occurred in this pass.


## 2026-09-20: autonomous product sprint on auto

Starting HEAD: bf0c5d9. Existing untracked planning/demo documentation was preserved. No subagents, hosted access, provisioning, seeding, reset, migrations, enrollment, provider calls, environment-file edits or pushes occurred. Shared Supabase was treated as read-only; even read checks were skipped in favor of offline fixtures.

### Implementation and decisions

- Added /prepare and GET /api/prepare using paginated family-scoped reads, literal humanFacts, direct subject provenance and two distinct contributors. Explicit disputes withhold the anchor. No synthetic face, confidence score, recall event or speech.
- Added reusable MemoryContextCard: name, recorded relationship, one attributed exact quote, optional More context / Why this?, original human words and source navigation to Atlas. Recall adds this context only after the unchanged gate and grounding checks.
- Resolved contributor names for spoken quotes, preserved You attribution, and limited model selection to one exact fact. The visual identity is separate metadata; TTS does not improvise a relationship. Context stays until dismissal/new capture; SILENT and failures clear prior context/audio.
- Added a read-only Family gap preview using existing deterministic Weaver selection. No question is sent automatically. Stage Run Weaver and assigned answers are unchanged.
- Added /today from finalized, matched family recall records, scoped to the local day. It explicitly distinguishes camera checks from meetings/conversations and cannot save a new memory.
- Clarified the enrollment permission checkbox; enabled pinch zoom. Deferred single-enrollment deletion: atomic receipt/revocation and retry semantics need a separate design.
- Removed existing raw Keeper-retrieval debug logging. Extracted the same denial regex for shared use, without changing its behavior.
- Updated README and preserved its original text under docs/history. Added current corrections above historical KNOWN_ISSUES/API_CONTRACT text rather than deleting history.

### Files

Product: app/prepare, app/today, app/api/prepare, app/api/weaver/preview, app/api/recall/route.ts, app/wearer/page.tsx, app/family/page.tsx, app/page.tsx, app/layout.tsx; components/MemoryContextCard.tsx, FamilyGap.tsx, PhotoUploader.tsx and memory-graph/MemoryAtlas.tsx; lib/briefing.ts, family-evidence.ts, reflection.ts and keepers.ts.

Verification: scripts/offline-check.mjs and offline-network.cjs, playwright.offline.config.ts, e2e/offline-test.ts and product-offline.spec.ts; existing browser specs now use the guard; prepare/reflection/recall/keepers/synthesize tests. Documentation: README, docs/product-sprint.md, docs/product-sprint-plan.md, archived README, this log, KNOWN_ISSUES and API_CONTRACT.

### Validation

- node scripts/offline-check.mjs test --reporter=dot: PASS, 195 tests / 23 files.
- node scripts/offline-check.mjs types: PASS.
- node scripts/offline-check.mjs lint: PASS, no warnings/errors.
- node scripts/offline-check.mjs build: PASS, 24 pages; existing webpack cache-snapshot warnings only.
- node scripts/offline-check.mjs browser --workers=2: PASS, all 44 Chromium tests. All Auth/data/mutation routes were intercepted; external networking and unmatched backend routes blocked.
- New Prepare layouts checked at 375 and 1440 pixels; no horizontal overflow and no serious/critical axe findings. Phone Prepare and successful recall screenshots visually inspected. Today phone layout and empty/error/disputed/sign-out/stale-cue behaviors covered.
- Initial suite: 8 failures exposed stale bf0c5d9 calibration expectations and missing subject fixture; corrected tests to the committed calibration and actual lookup, preserving scoring. Initial new browser suite: one selector matched both the application alert and Next route announcer; scoped it to main and reran successfully.
- Build/test process uses empty service credentials and non-local fetch/socket guards; .env.local is not changed. Offline build public values are fixtures, not production deployment output.
- scripts/check-services.mjs NOT RUN: it signs into shared Auth and calls face inference. No hosted verification, real device/media/TTS/biometric calibration or concurrent shared-backend testing is claimed.

### Final review / handoff

No diff in gate/config, auth, ingestion, migrations or seed/reset. The original Nora -> insufficient evidence/SILENT -> Weaver -> David's literal Italy answer -> graph update -> later grounded SPEAK remains logically supported and locally regression-tested. Prepare is an additional manual reading experience, not a gate bypass. No temporary logging or credentials were added.

Demo: open /prepare, select Nora, read name/relationship/quote, expand More context and Why this?, and follow View source in Atlas. Existing /wearer shows the same named hierarchy on a permitted recall. /family shows gap suggestions without sending them; existing Stage/answer controls remain for separately authorized demos. /today revisits recorded camera checks only. Do not run new shared-backend mutations during the read-only sprint.

Follow-ups: atomically revocable enrollment, richer contradiction detection, live provider/device verification under separate authorization, and future explicitly confirmed interaction capture. See docs/product-sprint.md for details.

Git: product commit 48e2233 created locally with configured signing intact. Initial signing failed inside the sandbox; the same commit succeeded outside it. Tests/documentation are a separate local commit. No push performed.
