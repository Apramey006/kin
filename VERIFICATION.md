# Verification

Checked on 2026-09-20. These checks describe the TypeScript handoff, not a
completed Rust port or a production readiness certification.

## Automated checks

- `npm run lint`: no warnings or errors.
- `npm test`: 47 unit tests pass. The two database integrations are skipped here.
- `npm run test:db`: all four migrations, SQL isolation/role/retrieval checks,
  and both route integration tests pass against disposable PostgreSQL/pgvector
  and PostgREST. Providers and media storage are test doubles.
- `npm run build`: production build passes. The face-api dependency emits a
  dynamic dependency warning during bundling.
- `npm run test:e2e`: 27 Chromium tests pass. Coverage includes real sign-in,
  empty-family onboarding, contributor and loved-one invitations, role/ownership
  rejection, sign-out, recording preview, deletion retry, camera/audio state,
  spring-sheet gestures, reduced motion, and automated accessibility checks.
- The unfolding story adds checks for source provenance, stable family perspectives,
  live answers with and without a supported origin, mouse/touch spring interaction,
  opt-in recording playback and cleanup, keyboard focus, narrow-screen large text,
  and accessibility. The scene was visually reviewed with the seeded
  family's real API data at desktop and phone widths. Live answer transitions use
  intercepted browser fixtures, not paid transcription/extraction calls.
- `npm audit`: zero known vulnerabilities in the installed dependency tree.

Browser checks use temporary confirmed accounts and remove their test data.
Visual and media interaction tests use fixtures; the camera regression uses a
synthetic feed. Email signup/reset responses are intercepted, so these tests do
not verify mail delivery. Local database tests never contact the configured
Supabase project. See README for setup and commands.

## Manual verification still needed

- Real iPhone/Safari camera, microphone, sheet/story gestures, and earbud output.
- Actual confirmation/password-reset email delivery and deployment callbacks.
- The complete timed sequence in DEMO.md using two relatives' recordings.
- Recognition under realistic lighting, poses, and unknown-person inputs.
  Face thresholds and the gate score are heuristics, not calibrated accuracy.

The earlier prototype's user-confirmed recording/replay and unknown-person
silence checks do not establish these properties for every device or new account.
No private event IDs, recordings, or screenshots are part of this handoff.

The optional `scripts/check-live-memory.ts` spends real provider credits. Its
updated authenticated version has not been rerun as part of the final cleanup.
