# UĞULTU — working notes for Claude

Mobile third-person survival horror, Three.js r170 + TypeScript + Vite, shipped as a static web build (PWA). See `README.md`, `docs/GDD.md`, `docs/DEPLOY.md`.

## Hard rules from the owner
* **No spending money**: only free, licence-checked assets/tools/services. Track licences in `ASSET_LICENSES.md`; credit only assets that require attribution.
* **The owner tests on an iPad (Safari) only.** After every *significant* change to playability or visuals (not after every small edit):
  1. `npm run build` must succeed (tsc + vite).
  2. Run `node tests/ipad.mjs` (iPad viewport/UA, multi-touch joystick + camera, buttons, rotation, GitHub Pages sub-path, service worker reload) and `node tests/flow.mjs`; run `node tests/story.mjs` when story/areas/AI changed.
  3. Check iPad Safari blockers: WebGL 2 only, audio unlocked from a gesture (music elements primed in `audio.unlock()`), no `element.volume` reliance, CSS `touch-action`, no APIs newer than Safari 15 without guards, pixel budget per quality (`Engine.PIXEL_BUDGET`).
  4. Commit and push; the `Web build (GitHub Pages)` workflow publishes the test build (deploy only when the repo is public — see `docs/DEPLOY.md`).
  5. A build that fails, shows a black screen, never finishes loading, has dead touch controls or missing assets is **not done**.
* Talk to the owner in Turkish.

## Practicalities
* Tests run Chromium + SwiftShader (slow, ~5 fps; game dt is clamped, so wait on conditions, not timers). `DIST=<dir>` points any test at another build directory.
* Character close-ups: `node tests/hair.mjs long` → `tests/out/hair_long_*.png`.
* Character textures are painted by `tools/pipeline/paint_characters.py` (needs the Quaternius UBC source glTFs); small `_s` variants are 512 px resizes.
