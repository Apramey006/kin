# Product sprint — 2026-09-20

Shared Supabase is read-only throughout this sprint. No provisioning, seed,
reset, migrations, provider calls, face enrollment or hosted recall tests.
Existing untracked planning/history files are preserved. Branch: `auto`.

1. Build a read-only, authenticated Prepare endpoint and mobile page using
   existing family-scoped graph, literal human facts and provenance. Require
   two distinct contributors; withhold anchors on explicit disputes. Manual
   selection is not face recognition and never creates a recall or plays TTS.
2. Reuse an evidence card for identity, recorded relationship, one exact quote,
   named attribution, optional context and a plain-language evidence explanation.
   Add this presentation to successful recall only after its unchanged gate.
3. Connect Family, Atlas and wearer navigation. Surface a read-only Weaver gap
   preview rather than scheduling writes. Clarify the existing enrollment
   permission flag; defer enrollment deletion if it risks existing invariants.
4. Add grounding/family-boundary regression tests and offline browser fixtures.
   Block all non-local browser networking and provider/database fetches during
   tests. Build with process-only empty service configuration; never edit env files.
5. Review changes, run tests/typecheck/lint/build, update the engineering log and
   known issues, and commit only this sprint's code/docs. Do not push.

Completed: both P0 experiences, provenance UI, read-only gap preview, permission
wording, and a read-only Today prototype after P0 verification. Enrollment
deletion is deferred pending atomic receipt/revocation design. See
`product-sprint.md` for the final scope and limitations.
