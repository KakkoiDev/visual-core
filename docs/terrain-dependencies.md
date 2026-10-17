# Terrain dependency kit

Gathered 2026-10-17 for the [terrain specification](terrain-generator-spec.md).
These are local building blocks. A constrained Blob 47 adapter is now shipped;
see [the tile recipe](../recipes/tiles.md) for actual commands. Broader upstream
features remain reference-only.
All six added runtime-source candidates are MIT licensed. The four npm archives
were verified against registry integrity values before extraction. Exact commits,
archive hashes and every local file hash are recorded in `vendor/LOCK.json`.

## Available locally

| Dependency | Pin | Local entry | Reuse and verification |
|---|---|---|---|
| [Tesserae](https://github.com/Thmsglchr/tesserae/tree/3f918019101bd8400d2deecf01222a0b5eb42da6) | 0.3.1 / `3f918019101bd8400d2deecf01222a0b5eb42da6` | `vendor/tesserae/src/`, `dist/` | Shapes, Blob 47/Dual 16, rendering, variants, diagnostics, recipe diff, manifests and Godot importer generation. Selected headless paths exercised in Node. |
| [simplex-noise](https://github.com/jwagner/simplex-noise.js) | 4.0.3 | `vendor/simplex-noise/dist/cjs/simplex-noise.js` | Ready-made 2D/3D/4D noise. Tested seeded 4D samples and periodic rectangular coordinates. |
| [Alea](https://github.com/coverslide/node-alea) | 1.0.1 | `vendor/alea/alea.js` | Seeded PRNG for simplex-noise. Same-seed equality and changed-seed differences checked. |
| [pngjs](https://github.com/pngjs/pngjs) | 7.0.0 | `vendor/pngjs/lib/png.js` | Pure JS PNG read/write with Node built-ins; rectangular atlas RGBA round-trip tested. Optional JS-only adapter/import helper; Python path retains existing PNG writer. |
| [fast-json-patch](https://github.com/Starcounter-Jack/JSON-Patch) | 3.1.1 | `vendor/fast-json-patch/index.js` | Standard patches for future JS callers. Tested nested replacement, non-mutating patch and prototype-write rejection. Existing Python patch protocol stays authoritative. |
| [Tileable Noise](https://github.com/omgkaustav/tileable-noise) | exact commit in lock | `vendor/tileable-noise/` | Small complete upstream app/shaders/docs as periodic-noise/warping/Gray–Scott reference. Requires WebGL 2; gathered, not executed, and excluded from production renderer. |

The four npm packages have no declared runtime package dependencies. Their files
and licenses are retained unchanged. Tesserae's engine/tests/docs/types are copied
unchanged; its original package metadata and lockfile are provenance, not runtime
install instructions. React application and Sharp-based CLI are excluded.
`dist/` is generated JavaScript, not an upstream published artifact.

All 27 non-test engine/types modules are transpiled for inspection. This does not
make every module Node-safe: storage, workers and browser export methods remain
browser features. Use only tested direct pixel/manifest paths in our adapter.
The added kit occupies roughly 2.3 MiB on the inspection machine.

## Tesserae reuse map

Modules below live under `vendor/tesserae/src/engine/`, with matching `.js` files
under `dist/engine/`. Reuse them rather than rebuilding the underlying systems.

| Need | Modules | Remaining adapter work |
|---|---|---|
| Neighbor masks, diagonal normalization, atlas coordinates | `blob47`, `dual16`, `topology` | Stable visual-core tile IDs and layout version |
| Masks, surface/border/cliff composition, RGBA pixels | `render` | Curated materials, palette/binary-alpha policy, final-output checks |
| Periodic fields and interior variation | `noise` | Evaluate existing fields before adding simplex to production |
| Seam findings and heatmaps | `seams` | Exact RGBA comparison across every exported variant |
| Types, defaults and cloning | `../types` | Small strict agent schema before upstream normalization |
| Canonical recipe and semantic differences | `recipeFormat` | Keep compact intent and resolved source separately |
| Manifest and Godot scripts | `export` | Stable namespace adapter and real Godot import tests |
| Production checks | `quality`, `productionProfiles` | Enforce our stricter pixel-art requirements |
| Protected manual interiors | `tileDesign` | Future feature, outside first release |
| Multi-tile patterns and specimens | `patterns`, `lab` | Fixed diagnostic specimen using actual atlas output |

Avoid browser worker/storage paths and convenience functions that generate IDs
using `Date.now()`. Supply explicit stable IDs. No React, Sharp, native addon,
compiler or browser is loaded by the headless probe.

## Reuse from visual-core itself

`src/visual_core.py` already supplies strict field helpers, PNG encoding, safe
asset paths, writer locks, stale-base rejection, numbered revisions, atomic
publication and semantic patches. Adapt those to terrain instead of introducing
another asset store. Existing Basecoat/Lucide and browser fixture tooling can
present previews; Pi remains responsible for chat and artifact presentation.

The staged helpers are options, not mandatory overhead: no second PNG library in
the Python path, no packer for a fixed 12×4 atlas, no new PRNG if upstream noise
already meets a material need, and no JSON Patch replacement for simple Python
patches. This gathers reusable solutions without requiring all of them in runtime.

## Executable evidence

Run without package installation or network access:

```sh
python3 tools/vendor.py check
node tests/terrain-dependencies.cjs .test-output/terrain-dependencies
python3 -m unittest discover -s tests -v
```

The probe blocks sockets, HTTP(S) requests and fetch before loading the code. The
Python test verifies vendor hashes and decoded-pixel baselines. Observed on macOS,
Node 24.21.0:

- Blob 47: all 47 states, two variant slots, 376 compatible RGBA edge comparisons.
- Dual Grid: all 16 states, two variant slots, 512 compatible RGBA comparisons.
- Both blank fixtures have zero edge delta, repeated-render equality and lossless
  rectangular PNG round-trips. Alpha-only corrupted edges are detected.
- Local Godot manifest/importer generation works; Godot itself was not run.
- Seeded 4D noise is repeatable over a wrapped 16×8 coordinate domain.
- Patch tests preserve original source/seed and reject prototype writes.

Two blank-fixture variant slots do not prove useful visual variation. These checks
do not cover textured presets, palette quantization, binary alpha, cross-platform
hashes, engine import, GPU execution, performance limits or weak-model behavior.
The upstream test sources are retained but their full suite was not run.

Important production gaps:

1. Upstream seams measure RGB only, accept nonzero thresholds and usually check
   variant zero outside artistic mode. Gate final pixels with our all-variant
   exact RGBA check instead of trusting the upstream verdict.
2. Upstream validation normalizes first. Reject invalid raw agent input before
   normalization can hide it.
3. Default rendering is not guaranteed to use at most 16 colors or binary alpha.
   Apply those policies before final seam checks.
4. UI/storage/export worker helpers must stay outside Pi's headless path.

## Contributor build and upgrades

Runtime uses checked-in JavaScript. TypeScript 5.8.3 (Apache-2.0) is contributor-only,
pinned with registry integrity in `tools/terrain-build/package-lock.json`:

```sh
npm ci --prefix tools/terrain-build --ignore-scripts
node tools/terrain-build/build.cjs --check
```

Omit `--check` only for deliberate regeneration. The build removes TypeScript
syntax and appends `.js` to relative static imports for Node ESM. It does not
change upstream source and does not type-check it. Review regenerated files,
update their hashes in the vendor lock explicitly, and rerun probes on upgrades.
Normal runtime does not need npm install. Licenses remain beside each dependency.

## Evaluated, not added

| Candidate | Decision |
|---|---|
| TextGen / Tilemancer | Native stack and/or unfinished engine; reference ideas only |
| Matz999/Tessera | License permission not established; no source/assets copied |
| [Ajv](https://github.com/ajv-validator/ajv) | Good future standalone-schema validator; existing Python checks avoid another runtime dependency today |
| [maxrects-packer](https://github.com/soimy/maxrects-packer) | Useful for variable-size sprites; terrain layout is fixed and implemented already |
| Sharp / Pillow / NumPy | Native packaging unnecessary for first render/export path |
| Full Tesserae frontend | Pi chat already owns interaction |

The compact recipe adapter, three material presets, final pixel validation and
revision integration are now implemented in src/terrain.py and tools/terrain-render.mjs.
The dependency probe described above still tests only its original blank fixtures;
production tests separately cover those new commands and presets.
Gathered code does not establish a finished terrain capability by itself.
