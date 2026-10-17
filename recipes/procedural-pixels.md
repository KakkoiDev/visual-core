# Generate pixels with the bundled upstream engine

**Outcome:** a seeded sprite with editable pixels, PNG/SVG exports and provenance.
**Default tool:** Pixel Sprite Generator 0.0.2, pinned source commit in vendor/LOCK.json.
Python 3.11+ and Node.js 18+ must be installed. No npm/pip install, browser, network
service or image model is needed for generation.

## Run first; do not draw rows from scratch

```sh
python3 tools/visual.py generate ship --seed 42 --out assets/visual/ship
python3 tools/visual.py read assets/visual/ship
```

Available presets: ship (12×12), robot (8×11), creature (12×12). Each uses an
upstream example mask. They produce **procedural retro silhouettes**, not arbitrary
semantic drawings: a seed cannot turn a spaceship mask into a detailed knight.
Use a preset that fits, inspect, and try a small bounded set of seeds if needed.
For exact silhouettes or frame animation, use the curated [pixel source](pixel-art.md).
Terrain still uses the tested terrain preset; this engine is not a terrain generator.

## Keep a consistent identity

The configuration is in presets/generators/ship.json (or robot/creature.json):

```json
{"name":"ship","mask":"spaceship","seed":42,"palette":{"0":"#172F36","1":"#60B6A1","2":"#D9F0D2"}}
```

Copy it, change only name/seed/palette as needed, then:

```sh
python3 tools/visual.py generate ship --config my-ship.json --out assets/visual/my-ship
```

--config supplies the entire configuration instead of preset defaults. --seed, if
present, overrides its seed. Allowed masks: spaceship, robot, dragon. Seeds are
integers 0–4294967295. Palette keys 0/1/2 mean outline/body/highlight and require
#RRGGBB. Do not send JavaScript, new mask paths, arbitrary options or a guessed API.
The adapter intentionally accepts only this small tested subset of upstream behavior.

## Inspect and revise

A numbered output includes spec.json, generator.json, sheet.png, sheet.svg,
atlas.json, preview.html, manifest.json and the upstream license. generator.json
records the initial config, upstream version/commit and adapter version. It is
provenance, not a second editable authority for the current pixels.

Serve the asset's parent directory and open 0001/preview.html. Inspect native scale
and 8×. Check silhouette, clipping and the shared palette. Present the actual image.
The tool's successful exit is not a visual review.

For “make the body blue” or “adjust that pixel”, read the current source and follow
[revise](revise.md): patch the palette or stable idle frame. Do **not** choose a new
seed or rerun generation over the folder. That would lose approved edits. Earlier
revisions and the original generator provenance are preserved. A new shape family
or seed exploration creates a new named asset alongside the current one.

Same seed/config and pinned adapter/engine produce the same pixels. PNG bytes are
repeatable within the same Python/zlib toolchain; cross-runtime compression bytes
are not the contract. The adapter scopes a seeded RNG to a fresh upstream VM,
bypasses browser rendering hooks, and uses upstream sampling/mirroring/edge
geometry. visual-core applies the palette and exports files; it does not claim to
reproduce upstream's randomized color shading.

**Recovery:** install Node 18+ if missing; no npm dependencies are required. On an
invalid config, correct the reported field. On “asset exists”, read/revise or choose
a new output. Do not overwrite earlier outputs or silently expand unsupported input.
