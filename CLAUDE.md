# UĞULTU — working notes for Claude

Mobile third-person survival horror, Three.js r170 + TypeScript + Vite. **Primary products are the native Android and iOS apps** (Capacitor shell in `android/`, `ios/`; native glue in `src/platform/Native.ts`). The web build (GitHub Pages) is only the owner's quick iPad test channel — never limit the native apps for its sake. See `README.md`, `docs/GDD.md`, `docs/NATIVE.md`, `docs/DEPLOY.md`.

## Hard rules from the owner
* **No spending money**: only free, licence-checked assets/tools/services. Track licences in `ASSET_LICENSES.md`; credit only assets that require attribution.
* **The owner tests on an iPad (Safari) only.** After every *significant* change to playability or visuals (not after every small edit):
  1. `npm run build` must succeed (tsc + vite).
  2. Run `node tests/ipad.mjs` (iPad viewport/UA, multi-touch joystick + camera, buttons, rotation, GitHub Pages sub-path, service worker reload) and `node tests/flow.mjs`; run `node tests/story.mjs` when story/areas/AI changed.
  3. Check iPad Safari blockers: WebGL 2 only, audio unlocked from a gesture (music elements primed in `audio.unlock()`), no `element.volume` reliance, CSS `touch-action`, no APIs newer than Safari 15 without guards, pixel budget per quality (`Engine.PIXEL_BUDGET`).
  4. When native code/config/plugins changed: `npm run cap:sync` and `node tests/native.mjs`; build the APK (`cd android && ./gradlew assembleDebug`, SDK at /opt/android-sdk if installed; in this sandbox Maven Central may rate-limit — use a mirror init script, never commit it).
  5. Commit and push; `Web build (GitHub Pages)` publishes the iPad test build, `Native builds` produces the APK (and AAB with signing secrets) and compiles iOS.
  6. A build that fails, shows a black screen, never finishes loading, has dead touch controls or missing assets is **not done**.
* Talk to the owner in Turkish.

## Practicalities
* Tests import Playwright through `tests/pw.mjs` (global install via NODE_PATH; `npm install` prunes node_modules links).
* Tests run Chromium + SwiftShader (slow, ~5 fps; game dt is clamped, so wait on conditions, not timers). `DIST=<dir>` points any test at another build directory.
* Character close-ups: `node tests/hair.mjs long` → `tests/out/hair_long_*.png`.
* Combat hitches: `node tests/perf_combat.mjs` must show no "new programs during combat" and no spikes. Shaders are warmed in `Game.loadArea` (compiled against the HDR target, then one real engine frame with everything visible/unculled + `FX.prewarm`).
* Playtest-fix screenshots: `node tests/visual_fixes.mjs` → `tests/out/vf-*.png` (chest lamp, map edge, apparition, blood pools).
* Character textures are painted by `tools/pipeline/paint_characters.py` (needs the Quaternius UBC source glTFs); small `_s` variants are 512 px resizes.
