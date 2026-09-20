# Canonical face inference service

From the repository root, install with `npm --prefix face-service ci`, initialize
missing local settings with `npm --prefix face-service run configure`, then run
`npm --prefix face-service start` on Node 20.12–22. Startup loads `.env.local`
from the repository root; existing environment variables take precedence.
The service needs `KIN_FACE_SERVICE_TOKEN`; the Next server needs the same token,
`KIN_FACE_SERVICE_URL=http://127.0.0.1:8100/detect`, and a random 32-byte hex
`KIN_FACE_TOKEN_KEY`. Never expose these server secrets to the browser.
The configure command generates local random secrets only for absent or empty
settings and preserves existing nonempty values. It never prints secret values.

The service binds loopback by default. `PORT` and `KIN_FACE_BIND` override its
listener. Keep remote deployments private with authenticated TLS transport.
`KIN_FACE_WEIGHTS` optionally overrides the repository's `public/models` directory.
The three shipped face-api 1.7.15 weight sets and preprocessing must stay identical
for enrollment and recognition. Model identity is persisted with each enrollment;
legacy unversioned vectors cannot identify a person.

Recognition defaults to Euclidean distance at most 0.45 and a margin of at least
0.10 between the best two distinct subjects. `KIN_FACE_MAX_DISTANCE` (0.01–0.60)
and `KIN_FACE_MIN_MARGIN` (0.05–0.50) allow explicit calibration with real consented
fixtures. Invalid settings fail closed. Multiple enrollments of one subject do
not count as competing identities. These scores are heuristics, not probabilities.

Native TensorFlow dependencies require a supported OS/architecture and native
runtime libraries. A failed native installation/startup blocks inference; it
does not permit falling back to browser descriptors. Use actual consented images
to validate recognition. Do not commit those images or audio recordings.

On Windows, TensorFlow 4.22.0 may compile its addon because the vendor's prebuilt
archive is unavailable. Install Visual Studio C++ build tools and a regular
Python installation, then set `$env:npm_config_python = 'C:\path\to\python.exe'`
before `npm --prefix face-service ci`. Microsoft Store Python can redirect the
Node header cache path and fail with `common.gypi not found`. The service's
postinstall script places the bundled TensorFlow DLL beside the compiled addon,
covering the vendor installer's N-API directory mismatch on Node 22.
