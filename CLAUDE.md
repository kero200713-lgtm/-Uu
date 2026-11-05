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
* Animations as the game plays them: `node tests/anim_strips.mjs melee,melee2,reload,heal,pickup,throw,hurt` → `tests/out/anim-*.png`; melee gameplay: `node tests/melee.mjs`.
* Aiming: `node tests/aim_check.mjs` (barrel vs camera aim < 12°, no torso spin while strafing). Guns are fitted to the hand in the aim pose (`Player.fitGun`); the upper body is aligned to the camera in closed loop (`Player.aimUpperBody`); bones with procedural offsets are reset each frame (`Animator.procedural`).
* Weapon holds: long guns are placed by `Player.holdLongGun` (butt in the shoulder pocket, aimed at `aimTarget` = crosshair point from `Combat.crosshairPoint`; low ready when not aiming) with two-bone IK (`Player.ik`) for both arms; fingers close with `applyGrip` (fist pose captured from Punch_Cross). Every bone touched procedurally must be listed in `anim.procedural(...)` — three's mixer does not rewrite unchanged values, so edits would otherwise accumulate.
* Weapon models are built in code (`src/player/WeaponModels.ts`: real-size pistol, rusty pipe; one draw call each). Hand frames (`Player.measureHands`: knuckle line, finger axis, fist hole) drive `placeFist` IK: pipe fitted through the fist along the thumb axis (`fitPipe`), pipe carry tip-down, two-hand pistol (`holdPistol`: isosceles aim / low ready, support hand mirrors the shooting fist), block poses (`holdGuard`). Screenshots: `node tests/hold.mjs` (CLOSE=1 hand close-ups, ONLY=pose,…) → `tests/out/hold*.png`.
* Melee defence: combo buffer (`meleeQueued`, `MELEE` timings in Player.ts), block/parry (`Player.block`, enemies get `blocked(parry)`), dodge roll (`startDodge`, 'dodge' state). Touch: shield button replaces aim for melee; dodge button only when `Game.combatNear()`. `node tests/melee.mjs` checks combo, block, parry and dodge; strips: `node tests/anim_strips.mjs combo,roll,block`.
* Props audit: `node tests/audit_props.mjs` (nothing floating, tall furniture against walls). Items/props with `h` are snapped onto the furniture under them (`Level.supportTop`); tall interior furniture is moved to the nearest wall (`Level.toWall`); indoor lights get fixtures automatically.
* Interiors: `dress: true` areas get rooms furnished by `Level.dressRooms` (interior models face +Z; `node tests/prop_faces.mjs` to check new models); screenshots `node tests/town_rooms.mjs` (BRIGHT=1 adds inspection light).
* Collision: fences/rubble are `thin` tiles (line/heap boxes, ground under them); solid props collide by their footprint below 1.1 m (`Level.footprint`).
* Playtest-fix screenshots: `node tests/visual_fixes.mjs` → `tests/out/vf-*.png` (chest lamp, map edge, apparition, blood pools).
* Ela's clothes are real meshes: `src/player/Garments.ts` grows jacket/jeans/boots shells from the body (same skin weights; fabric textures in `public/assets/textures/cloth/`, CC0 Poly Haven), snaps hem/cuffs to clean lines, builds a stand-up collar and turned-in hems, and removes the body triangles they cover. Check with `node tests/outfit.mjs` (CLOSE=1 for close-ups). Strip triangles must face their opening (double-sided shading lights back faces from behind).
* Character textures are painted by `tools/pipeline/paint_characters.py` (needs the Quaternius UBC source glTFs); small `_s` variants are 512 px resizes.
