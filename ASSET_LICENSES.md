# Asset & Third-Party Licences — UĞULTU

Every asset in this project is free and cleared for commercial use. Nothing was
bought, no subscription is required, and no asset of doubtful origin is used.

The game's **Credits** screen lists only what a licence requires (font and
code licence notices). Public-domain (CC0) and "no attribution required"
assets are intentionally *not* listed there, as requested in the brief. They are
recorded below only so their origin stays traceable.

---

## 1. Items that require licence notices (shipped + shown in-game)

| Asset | Author / Source | Licence | What the licence asks for | Where we satisfy it |
|---|---|---|---|---|
| **Barlow Condensed** (Light, Medium, SemiBold) font | The Barlow Project Authors — https://github.com/jpt/barlow (via Google Fonts) | SIL Open Font License 1.1 | Ship the licence with the font, keep the copyright notice, don't sell the font alone | `public/assets/fonts/OFL-BarlowCondensed.txt`; Credits → Licences |
| **Caveat** font | The Caveat Project Authors — https://github.com/googlefonts/caveat | SIL Open Font License 1.1 | Same as above | `public/assets/fonts/OFL-Caveat.txt`; Credits → Licences |
| **Special Elite** font | Astigmatic (Brian J. Bonislawsky) via Google Fonts | Apache License 2.0 | Include the licence text with redistributions | `public/assets/fonts/LICENSE-SpecialElite.txt`; Credits → Licences |
| **three.js** r170 (engine library, bundled) | three.js authors — https://threejs.org | MIT | Keep the copyright + permission notice with copies of the software | `public/licenses.txt`; Credits → Licences |
| **meshoptimizer decoder** (bundled via three.js addons) | Arseny Kapoulkine | MIT | Same as above | `public/licenses.txt` |
| **Capacitor** 8 runtime + plugins (app, haptics, preferences, splash-screen, status-bar) — native Android/iOS shell | Drifty Co. / Ionic — https://capacitorjs.com | MIT | Same as above | `public/licenses.txt`; Credits → Licences |

Fonts were subset to Latin + Latin Extended-A (Turkish glyphs) and converted to
WOFF2. Under the OFL this is a "Modified Version"; the reserved font names are
kept only because the OFL FAQ allows subsetting for web embedding of the
unmodified glyph design.

## 2. Public-domain / no-attribution assets (not shown in Credits)

| Asset group | Source | Licence | Notes |
|---|---|---|---|
| Universal Base Characters [Standard] (bodies, hair) | Quaternius — https://quaternius.com | CC0 1.0 | Clothing, dirt, blood and infection are painted procedurally by `tools/pipeline/paint_characters.py` |
| Universal Animation Library 1 & 2 [Standard] | Quaternius | CC0 1.0 | Subset of clips, translation/scale tracks stripped, resampled |
| Zombie Apocalypse Kit (props, weapons, vehicles) | Quaternius | CC0 1.0 | Materials baked to vertex colours |
| Survival Pack, Ultimate Home Interior, Ultimate Nature, Ultimate Modular Sci-Fi | Quaternius | CC0 1.0 | Converted OBJ → GLB, baked, packed |
| PBR surface textures (Ground023, Ground106, Ground078, Asphalt031, Road007, Concrete012, Concrete046, PaintedPlaster006, Tiles107, Tiles074, OfficeCeiling001, WoodFloor043, Planks037A, Bricks105, RoofingTiles013A, DiamondPlate008C, MetalWalkway014, Metal053B, PaintedMetal006, Rock058, Gravel023, Wallpaper001A) | ambientCG — https://ambientcg.com | CC0 1.0 | Down-sampled to 1024/512/256 px |
| Sound effects from the Soundza catalogue (pistol, shotgun, shotgun reload, zombie vocals, monster growl, creature scream/death, wooden door creak) | Soundza — https://soundza.com | Soundza Standard License | Free for commercial use, **no attribution required**. Not redistributed as standalone files: all SFX are merged into one processed audio sprite (`sfx.mp3`). Must not be used to train AI. |
| AI-generated sound effects & music (footsteps, player vocals, impacts, doors, machinery, ambience loops, menu/safe-room/chase/boss/ending music) | Generated with Soundza's free generator (`stable-audio-3-medium`, Lyria) | Free for commercial use, no attribution required | **AI-generated content** — disclosed here. |

## 3. Original work (this project)

* All code, level layouts, story, documents, character variants, the Listener's
  fungal head and the Choir boss geometry/shaders are original to this project.
* Procedural audio (wind, drones, radio noise, UI clicks, heartbeat) is
  synthesised at runtime in `src/audio/Procedural.ts`.

## 4. Re-building assets

`tools/pipeline/` contains the scripts that turned the downloaded sources into
the shipped files (`build_props.mjs`, `build_characters.mjs`,
`paint_characters.py`, `build_textures.py`, `build_audio.py`). Source
downloads are not committed; see `tools/pipeline/README.md`.
