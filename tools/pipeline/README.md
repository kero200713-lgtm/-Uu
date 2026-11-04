# Asset pipeline

Source downloads are **not** committed (they are large and some licences do not
allow redistributing the raw files). These scripts reproduce `public/assets/`
from the original free sources listed in `ASSET_LICENSES.md`.

| Script | Input | Output |
|---|---|---|
| `mk_manifest.py` | converted Quaternius GLBs | pack manifests (real-world scale, colour grading) |
| `build_props.mjs` | manifest | `models/{nature,nature_lod,interior,facility,items,urban}.glb` — materials baked to vertex colours, one primitive per prop, meshopt |
| `build_characters.mjs` | Universal Base Characters + Universal Animation Library 1/2 | `models/characters/*` — bodies, LOD bodies, hair, two animation packs |
| `paint_characters.py` | base character glTF + skin textures | `textures/characters/<variant>_{albedo,normal,rough,glow}.jpg` — procedural clothing, dirt, blood, infection |
| `build_textures.py` | ambientCG 1K-JPG sets | `textures/surfaces/<name>_{c,n,r}.jpg` |
| `build_audio.py` | Soundza catalogue + generated WAVs | `audio/sfx.mp3` sprite + `audio.json`, ambience loops, music |
| `glbstat.mjs` | any GLB | triangle / primitive statistics |

OBJ → GLB conversion used `obj2gltf`; Quaternius glTF → GLB used `gltf-transform copy`.
Small 512 px texture variants (`*_s.jpg`) for the Low quality preset are produced with Pillow
(see the commit history / `README.md`).
