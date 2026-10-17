# Terrain generator specification

Status: first Blob 47 adapter implemented, 2026-10-17. The exact public API and
current limitations are in [the tile recipe](../recipes/tiles.md). This document
retains the broader target design: some proposed controls, artifact names and
later milestones below are not implemented. Do not infer capability from design.

Shipped: three presets, 16/32/64 px tiles, six-color palettes, binary alpha,
1..4 interior variants, final-pixel RGBA seam checks, base repetition, map previews,
editable source, strict JSON, numbered revisions and a real browser consumer.
Deferred: Dual Grid API, cliffs, engine exports, weak-model evaluation and the
broader material controls. The [dependency kit](terrain-dependencies.md) records
upstream extraction evidence; production tests live in tests/test_terrain.py.

## Product contract

A user asks for a terrain kit in chat. The agent chooses a local preset, supplies
a small validated JSON recipe, runs a deterministic renderer and presents a map
preview plus an atlas and editable source. Follow-up requests patch that recipe
with stable IDs and preserve earlier revisions. No account, paid service, remote
image model, MCP server, node-editor UI or network request is required.

Example: “Make cheerful 16 px grass over dirt for a top-down robot game, with
four variations.” Then: “Less busy, warmer dirt, keep the same layout.” The second
request changes detail density and palette; it does not pick a new seed, reorder
tiles, replace the material recipe or regenerate the project from an empty brief.

This generates reusable tile assets and diagnostic specimen maps. It does not
generate a game's world, gameplay, navigation rules or level progression.

## Ideas to adopt and evidence

| Project | Useful idea | Decision |
|---|---|---|
| [Tesserae](https://github.com/Thmsglchr/tesserae/tree/3f918019101bd8400d2deecf01222a0b5eb42da6) | Separate recipe, topology, pixel renderer, seam diagnostics and engine export; Blob 47, Dual Grid 16; interior variants; protected manual edits | Preferred terrain engine candidate. Adapt a pinned headless subset before writing replacement topology/rendering code. |
| [Tilemancer](https://github.com/madeso/tilemancer) | Compose a material from noise, filters and height-based shading; named presets | Offer curated, bounded material recipes. Keep its node graph behind presets conceptually; do not require an agent to invent graphs. No Tilemancer code adoption is planned. |
| [TextGen](https://github.com/madeso/textgen/tree/e5ecf634dbbcff62c051b2e126d17b83e1d37c8f) | Embeddable library separated from an editor | Keep rendering independent of presentation. Do not adopt its unfinished engine as a runtime dependency. |
| [Tileable Noise](https://github.com/omgkaustav/tileable-noise) | Periodic sampling, aspect-aware noise, periodic warping, 3×3 previews | Use periodic material fields and wrapped filters. GPU rendering and reaction–diffusion are optional future experiments. |
| [Tessera](https://github.com/Matz999/Tessera) | Seeds plus explicit parameters, manifests, contact-sheet curation and selected favorites | Generate a small bounded comparison sheet on request; preserve selected variants and provenance. No source/assets copied without verified license permission. |
| [Pixel Sprite Generator](https://github.com/zfedoran/pixel-sprite-generator/tree/8c2cee790b0ae5885319181e56745ae45a0f8138) | Strong shape constraints make procedural output manageable; seeded adapter already bundled here | Apply the same constrained-preset approach. Its sprite masks are not terrain topology. |
| visual-core and the Pi music workflow | Small task router, editable source, validation, numbered revisions, local previews | Reuse visual-core's revision and packaging conventions; host chat remains responsible for conversation and presentation. |

Initial evidence level: Tesserae's `src/cli.ts`, `src/engine/{topology,blob47,dual16,
render,seams,recipeFormat,noise}.ts`, package manifest and license were inspected
at the commit above. TextGen source was inspected at its pinned commit. Other
external projects are design references based on their published documentation
and, for the already bundled sprite engine, existing integration. Tesserae has
not been built, exercised or accepted into visual-core by this specification.
README claims and upstream test files do not establish that our integration works.
The subsequent dependency-kit probes supersede the initial not-exercised status
for selected headless paths only; see their recorded scope and limitations.

Tesserae already has a headless CLI with validation, diff, build and Godot pack
generation. Its CLI uses Sharp for image decoding/encoding and its application
uses React. The adoption question is whether its engine can be packaged cleanly
without the application and native image dependency; it is not whether we need
to create another complete terrain editor.

## Architecture and reuse boundary

### Required stack and Pi integration

The supported implementation stack is JavaScript and/or Python, matching
pi-local-harness. Prefer **JavaScript running in Node.js for terrain rendering**,
with the existing Python CLI handling visual-core packaging and revisions.
TypeScript is acceptable for contributor source only when shipped as prebuilt
JavaScript; users and Pi must not need a TypeScript compiler or dev server.
No C/C++ renderer, native addon, Sharp dependency, GPU or WebAssembly runtime is
required in the production path. TextGen and Tilemancer are design references,
not dependencies to compile or embed.

Expose the renderer as a plain JavaScript module accepting a resolved recipe and
returning pixel buffers plus metadata, with a JSON subprocess adapter for the
Python CLI. Python owns PNG encoding using the existing local exporter. Do not
add a second JavaScript image library merely to duplicate that exporter. If the
preferred upstream extraction cannot meet this stack, record the blocker before
choosing a Python or JavaScript alternative; do not introduce a native dependency
as an implicit fallback.

Pi invokes the ordinary local CLI through its existing tool mechanism, parses
the JSON result and presents the returned preview file paths in chat. It keeps
the asset directory and revision reference for follow-up calls. No new service,
MCP server, editor UI or conversation store is introduced. A bundled agent recipe
explains catalog → create → inspect → read → revise, including failure recovery.
This defines the integration contract; it does not claim Pi is integrated yet.

Proposed flow:

```text
chat brief → preset + small JSON → strict validation → resolved recipe
           → material bitmaps → pinned terrain engine → quality gate
           → revision directory → atlas + specimen + source + manifest
```

The implementation starts with an extraction spike against the exact Tesserae
commit above. Keep upstream files and MIT notice intact under `vendor/`; keep
our adapter and any documented patches separate. Record every file hash, source
commit, build-tool lockfile and bundled artifact hash in `vendor/LOCK.json`.
Subsequent upstream upgrades are explicit reviewed changes, never runtime fetches.

Prefer a prebuilt Node-compatible engine bundle: existing Python CLI owns strict
input validation, safe file handling, revision commits and PNG writing; the bundle
returns bounded raw RGBA buffers and metadata. Reuse Tesserae's pure pixel render
path and topology. Avoid importing its React UI or its Sharp-based CLI wholesale.
Normal use should require only the already documented Python and Node runtimes,
with no npm install, compiler, GPU or browser automation. Contributor builds may
use pinned dev dependencies. Bundle their required license notices too.

Spike acceptance: render all 47 masks from one pinned fixture, encode PNG using
the existing Python exporter, render a specimen with the same pixels, and run
upstream-relevant topology/seam tests plus adapter tests on macOS and Linux with
network disabled. Measure time, peak memory and bundle size. If extraction needs
substantial upstream rewrites or cannot preserve seam guarantees, document that
result and reconsider the dependency before implementing a parallel renderer.
Do not silently fall back to a second implementation.

## First release scope

- Top-down orthogonal square tiles: 16, 32 or 64 px; default 16.
- Blob 47 topology by default: one foreground material against transparent empty
  space. A separate repeatable base layer supplies the background material.
- Three coherent starter kits: meadow (grass/dirt), coast (sand/water), dungeon
  (stone floor/void). Each ships local textures, palette roles, a sample recipe
  and expected specimen images. No user-provided texture is needed to start.
- Strict pixel art: opaque colors come from a named palette of at most 16 colors,
  alpha is binary, nearest-neighbor scaling, integer contour widths, no blur or
  antialiasing. If upstream rendering introduces intermediate values, quantize
  before seam validation and check the final exported bytes.
- One to four interior variants, default two. Variants share compatible borders;
  their seed changes only interior detail. Background repetition is tested too.
- One transition pair per set. A multi-material scene composes explicit ordered
  layers. Do not promise arbitrary three-material junctions from pairwise tiles.
- Engine-neutral PNG/JSON first; Godot export is a separately tested next stage.

Defer cliffs, animation, normal/AO/height maps, Dual Grid 16, isometric/hex grids,
arbitrary custom graphs, learned image generation, reaction–diffusion, texture
imports, manual paint overrides and procedural world generation. These remain
possible without inflating the initial agent interface.

## Agent-facing recipe

Illustrative proposed input; this is not a current visual-core asset schema:

```json
{
  "schema": "visual-core.terrain/1",
  "id": "robot-meadow",
  "preset": "meadow",
  "seed": 42,
  "tile_size": 16,
  "topology": "blob47",
  "palette": "meadow-warm",
  "materials": {
    "ground": {"recipe": "dirt", "detail": "low"},
    "surface": {"recipe": "grass", "detail": "medium"}
  },
  "contour": {"profile": "soft", "roughness": "low", "border_px": 1},
  "variants": 4,
  "light": "north-west"
}
```

Required fields are schema, id and preset. Omitted fields resolve to preset
defaults and are saved explicitly in `resolved.json`; examples use the full form
to explain the controls. `seed` is uint32, IDs use bounded lowercase slug syntax,
and enum values come from the local catalog. Reject unknown keys, duplicate JSON
keys, non-finite values, wrong types, invalid ranges, unknown preset versions and
unsupported combinations with a field path and suggested allowed value. Never
silently clamp or normalize malformed agent input into a different request.

Preset definitions translate those few choices to full upstream recipes. Version
each preset, palette, material recipe and adapter independently. Embed the resolved
upstream recipe and all input texture hashes in each successful revision, so a
future preset update cannot change an old output. The user recipe stays compact;
the renderer never relies on an LLM remembering dozens of low-level controls.

Use named role palettes (ground dark/base/light; surface dark/base/light; border;
accent) with curated ramps and fixed light direction. Material generation uses
small pinned periodic primitives (value noise, spots, clustered tufts, block/crack
patterns) and fixed preset compositions. Start with bundled tileable bitmap
materials if they provide better results; do not build a general shader language.
Keep detail density low enough for sprites and gameplay objects to remain legible.

## Topology, randomness and seam contract

Blob masks use the pinned engine's bit assignment and diagonal normalization.
Export that assignment and the mask-to-atlas lookup in the manifest; consumers
must never guess row order. Stable tile IDs are
`<set-id>/blob47/<mask>/v<variant>`; background IDs use a separate namespace.
47 logical foreground states occupy a 12×4 atlas, with the unused cell declared
explicitly. Include a base atlas and deterministic variant weights in metadata.

Random streams derive from a specified integer hash/PRNG and separate namespaces
for contour, material, interior variants and preview placement. No global random
state, wall-clock seed or order-dependent sampling. Seed + resolved recipe + tool
lock must reproduce identical decoded RGBA pixels and canonical manifests on
supported runtimes. PNG compression metadata is excluded from the pixel hash.
Any upstream floating-point algorithm is covered by cross-platform fixtures;
exact reproducibility is an acceptance criterion, not an assumed property.

Construct borders from shared topology and material coordinates. Protect a
minimum one-pixel seam ring for variants, expanding it to cover any filter or
shading footprint. Interior decoration cannot affect that ring. Material filters
wrap at the tile period; sampling coordinates and pixel centers are explicit.
Periodicity of a mathematical field alone does not prove exported pixel equality.

Validate only topology-compatible horizontal/vertical neighbors, over every
variant pairing, with exact RGBA edge equality for this pixel-art contract.
Also inspect corner neighborhoods, transparency, diagonal normalization and the
base tile repeat. Equal edge pixels are necessary under our contract but are
not sufficient evidence of good art: detect abrupt near-edge bands and inspect
repetition on the specimen. Use the final quantized/exported pixels for tests.
Validation must fail on intentionally corrupted seam fixtures.

## Proposed commands and chat loop

These spellings describe a future API and must not appear as current commands in
the capability catalog until implemented:

```sh
python3 tools/visual.py terrain catalog
python3 tools/visual.py terrain template meadow
python3 tools/visual.py terrain check recipe.json
python3 tools/visual.py terrain create recipe.json --out assets/meadow
python3 tools/visual.py terrain read assets/meadow
python3 tools/visual.py terrain revise assets/meadow --base 1 --patch changes.json
```

Catalog returns supported presets, bounded controls, defaults and local examples.
Read returns current revision, editable source and provenance. Check validates
without writing a revision. Create renders and checks into a temporary directory;
only a passing complete result becomes a numbered revision. Reuse the existing
exclusive lock, stale-base rejection and atomic publication behavior. On failure
retain the prior current revision and emit a structured diagnostic, not a partial
successful asset. JSON stdout carries status and artifact paths; stderr carries
human-readable diagnostics. Reuse existing CLI error conventions where available.

Patches update semantic fields with strict validation; no arbitrary executable
code, generated Lua, remote URLs or arbitrary file paths. An unchanged patch is
a no-op. Palette/detail changes preserve IDs, seed, topology and atlas layout.
Topology, set identity or tile-size changes require a new named set, with an
explicit compatibility warning in the result. Do not reuse a stale source recipe
after a revision; read current state first.

The agent chooses one preset, creates once, inspects native-scale and enlarged
previews, and fixes a concrete issue. Bound automatic correction to two attempts;
if still failing, present the failure and evidence. A machine quality pass does
not authorize claiming aesthetic quality. Offer at most four labeled candidates
only when exploration is requested; selection records a favorite, never erases
other source revisions or changes the seed invisibly.

## Output and project integration

```text
assets/meadow/
  current.json
  0001/
    recipe.json              # compact user intent
    resolved.json            # pinned defaults + full engine recipe
    atlas.png                # all foreground states and variants
    base.png                 # repeatable background material
    manifest.json            # stable IDs, rects, masks, roles and hashes
    preview-native.png       # diagnostic map at actual pixel density
    preview-large.png        # nearest-neighbor enlargement
    contact-sheet.png        # labeled atlas, preview only
    quality.json             # checks, counts, findings and warnings
    provenance.json          # generator/adapter/preset/input hashes
    licenses/                # adopted code and bundled texture notices
```

The manifest specifies schema version, tile size, RGBA/color convention, atlas
dimensions, padding, transparent unused cells, variant weights, topology bits,
rectangles, local references and decoded pixel hashes. No absolute paths or
timestamps in canonical reproducibility data. Record revision history separately.
First-release atlas uses zero spacing/padding and nearest sampling with mipmaps
off; later engine exports may add extrusion with explicit content rectangles.

The preview is a fixed seeded 24×16 specimen containing an island, inner hole,
thin path, convex/concave corners, diagonal contacts, cross-junctions and a broad
fill area. It is built from exported atlas pixels and the same neighbor-to-mask
lookup a consumer uses. Include 3×3 material repeats and variant adjacency views.
No preview-only renderer may hide faults in export.

Games use `manifest.json` to resolve masks and variant rectangles; variants are
selected deterministically per map cell, not per animation frame. The generator
does not install collision, navigation or walkability implicitly. Examples must
show layering, nearest filtering and deterministic selection in one tiny local
browser fixture. Future Godot/Tiled adapters must map semantics explicitly and
pass real engine imports before being advertised as supported.

## Delivery stages and acceptance

1. **Reuse spike.** Prove the pinned headless Tesserae extraction, license inventory,
   offline packaging, pixel determinism and dependency budget. Record what runs
   and what still needs adaptation. No public capability claim at this stage.
2. **First usable kit.** Meadow plus Blob 47, base layer, strict recipe, numbered
   revisions, quality report, previews and one browser consumer fixture. An agent
   should complete a request using only the local recipe and catalog.
3. **Curated coverage.** Add coast/dungeon and four variants with seam checks;
   compare native-scale examples before accepting presets. Publish local recipes
   for “less busy,” “change palette,” “match sprites” and “keep the same terrain.”
4. **Engine integration.** Reuse/adapt Tesserae's Godot export, pin the tested Godot
   version and run a real headless import/screenshot fixture. Tiled export follows
   a demonstrated consumer need. Dual Grid is a separate topology contract with
   documented runtime placement, not a different atlas layout for Blob 47.
5. **Optional growth.** Protected manual interiors, texture imports, cliffs,
   animation and auxiliary maps only after a concrete task and matching tests.

Release acceptance includes:

- Clean offline checkout after documented runtime setup; no network access during
  catalog, generation, revision or preview. Verify vendor hashes before loading.
- Strict malformed-input, size-limit and unsupported-combination tests; safe
  failure on interrupted writes, stale revisions and concurrent generation.
- Complete mask coverage, manifest bounds and unused-cell transparency. Test
  rectangular atlas/buffer indexing, even though logical tiles are square.
- Every compatible edge/variant pair passes; deliberately broken pixels fail.
  Test alpha, corners, sampling at boundaries and final quantization.
- Same resolved inputs reproduce decoded pixel hashes on macOS/Linux; changing
  only palette preserves masks/IDs; changing detail preserves topology and seed;
  adding a variant preserves existing variants' pixels.
- Prior revisions stay unchanged; failed checks never update `current.json`.
- The browser fixture draws actual atlas output, with native-scale screenshots
  visually inspected and all external network requests blocked.
- Benchmark default 16 px/two variants at a target below five seconds, and bounded
  64 px/four variants below 30 seconds and 256 MiB process-tree peak memory on a
  documented test machine. These are targets; record measurements before claiming.
- Run at least ten local/weak-model prompts (creation, revision, unsupported task,
  stale base and recovery), retain outputs and score valid recipe, correct tool
  use, preserved state and visible artifact separately from subjective art quality.

The first bounded adapter is implemented; see the status at the top and
recipes/tiles.md for its tested scope. Performance targets, weak-model results
and later milestones remain unvalidated. Update capability claims only when
each stage actually passes its acceptance checks.
