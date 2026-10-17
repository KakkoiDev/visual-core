# Tesserae

> Design terrain. Prove every seam. Ship to Godot.

[![Validation](https://github.com/Thmsglchr/tesserae/actions/workflows/validation.yml/badge.svg)](https://github.com/Thmsglchr/tesserae/actions/workflows/validation.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Support Tesserae](https://img.shields.io/badge/Support-Tesserae-0070BA?logo=paypal&logoColor=white)](https://paypal.me/ThomasGuilcher)

Tesserae is a local-first visual terrain authoring tool for Godot 4. Turn textures into complete Blob 47 or Dual Grid 16 tilesets, design borders, cliffs and transparent overlays, inspect every connection, detect broken seams, and export production-ready native Godot TileSets.

Everything runs locally in your browser. Your textures are never uploaded.

[Changelog](CHANGELOG.md) · [Documentation française](README.fr.md)

## See Tesserae in action

https://github.com/user-attachments/assets/f5b5f5da-d244-4fc2-b4e0-8efd6e830af9

A 48-second walkthrough of the complete **Design → Validate → Ship to Godot** workflow.

## Run

```powershell
pnpm install
pnpm dev
```

Then open `http://127.0.0.1:5173`. English is used by default; switch to French from the `EN / FR` control in the top bar.

## Workflow

Tesserae now follows the same decision order as a production art task:

1. **Design** — stack materials, shape the shared contour and tune the selected terrain or material while a large read-only specimen keeps the result in view.
2. **Validate** — paint connection scenarios, inspect all atlas states, repair individual tiles, review seams and auxiliary maps in Art Lab, then check the result as a game asset.
3. **Ship to Godot** — read one clear readiness verdict, install directly when supported, or download the complete fallback pack. Engine and gameplay metadata stay available under Advanced settings.

Open **My configs** to start. **Start from a texture** is the recommended entry point: a PNG, JPG or WebP becomes an editable terrain immediately, and topology, output mode and materials remain changeable. Starter terrain, Wild Coast and Artistic Coast templates remain available for exploration or production scaffolding.

The **Artistic Coast** preset creates a 128 px Blob 47 with cliffs and four weighted variants. Its contour combines broad cape/cove motifs, chiselled ridges and fine breakup. Variants change inside each tile while keeping identical border pixels, so **Seams** cross-checks every variant pairing. The Godot importer creates all four weighted alternatives in a standard TileSet, with no Dual Grid runtime.

Directed multi-tile set pieces are authored in **Macro Pattern Lab** and exported as reusable Godot `TileMapPattern` builders. **Repetition Radar** reports dominant masks, adjacent duplicates and pattern entropy before a stamp is saved.

The **Tile Studio** turns an atlas selection into an authoring unit: it explains the active contacts, previews the tile at a useful scale, imports custom pixels, and derives the unique rotated orientations. Manual imports default to **Protected center** mode, which keeps a configurable generated seam ring and clips custom art to the canonical silhouette. Full replacement remains available for deliberately authored complete tiles and Blob 15 sheets.

The **Game proof** tab translates atlas diagnostics into level-design decisions: production rules, difficult connections, invisible joins, cliff pixels, reusable places and Godot behavior. A recipe can follow Creative freedom, Strict pixel art or Orthogonal 90° rules. Direct Godot publishing also creates `tesserae-playground.tscn`, already painted for an immediate engine check.

1. Start from a texture or choose a template in the local project library. The Starter terrain begins in Blob 47 at 64 px, with fully rounded corners, straight edges, one 20% inner border and a real transparent background. Dual Grid 16 remains available from Project settings.
   In Blob 47, **Import Blob 15** accepts a 5×4 PNG: the first 4×4 cells contain the fifteen cardinal states and cell `(4, 0)` contains the crossroads. Tesserae splits every tile into four quarters, uses the crossroads L-shaped quarters for missing diagonal corners, and exports the 47 states on a 12×4 sheet.
2. Drop a texture onto the surface, a border or the cliff. Flat materials use a tile-relative scale; cliff motifs automatically use the imported file width in output pixels, with the tile size as the fallback when no texture is loaded. The detected width remains editable.
   **Material output** can be changed at any time without restarting the project. **Dig outside** keeps the surface texture in the generated motif and makes its surroundings transparent. **Dig inside** makes the motif itself transparent, ideal for a grass overlay placed above a complete dirt ground. The user enters one **alpha extrusion** in `%` or `px`; Tesserae expands the chosen transparent side automatically from the generated contour. The checkerboard is only a live preview—nothing is painted by hand. Cut-out modes multiply their generated mask by the source PNG alpha, preserve every hidden border and cliff for a later return to composed terrain, and reuse the normal edge-deformation controls without breaking tile joins.
   Each material has an independent −100% to +100% brightness adjustment that preserves its hue, pattern and transparency. Optional cast shadows reach two tiles with up to one tile of continuous soft blur; export margins expand automatically.
3. Add inner borders as Photoshop-like layers. Each new border is placed below the previous one and grows by 10%, up to 50%.
4. Deform the shared terrain contour with a seamless sine wave or organic noise. Organic frequency uses a designer-friendly 1–10 scale mapped to the useful 0.25–2 range, plus amplitude, detail-layer count, fine-detail strength and a continuous pattern offset. Surface, inner borders and cliff faces all follow the same contour without tile seams.
5. Set inner-border reach from 0% at the contour through a seam-safe 0–99% contour range. At exactly 100%, the material deliberately covers every interior pixel, including context-free Full states. Each border fades independently across its complete authored width, so overlapping borders retain distinct gradients. Every material can also cast a configurable, non-destructive shadow into albedo and AO; shadows are disabled by default.
6. Enable the cliff when needed. Its material profile has three structural zones: the existing terrain surface, a rock crown attached to the contour, and the projected wall. The crown is derived from the wall by default; an optional dedicated horizontal strip follows the contour tangent, uses its source width as the repeat length, and infers its visible width from the strip height. It is rendered above the wall and terrain, independently from ordinary inner borders. Choose which faces are visible, then select a curated Soft, Natural or Dramatic art-direction profile. Tesserae automatically combines the main height with shorter sides and a restrained rear edge, and shows the three resulting heights in pixels. Optional side, rear and rare-detail slots can replace only the roles that need dedicated painted material. A continuous large-scale warp and sparse-detail mask break stamped repetition without randomizing individual tiles. Advanced shaping exposes the exact ratios, side-texture compression, painted relief contrast and rock-pattern size. Real contour normals blend these choices smoothly through corners. Map previews anchor uploaded motifs to world pixels; the projected normal map preserves the direction field for the future Godot material.
7. Paint the sandbox and inspect every generated connection in Atlas 47. The interactive workspace renders at a fixed 32 px per tile for fast iteration; atlases, PNGs and Godot packs always use the recipe's full output resolution.
   The large canvas now always uses the same production renderer as atlas PNGs, seam diagnostics and Godot packs. **Composite** shows the exported material pixels and **Mask** shows the same canonical silhouettes without introducing a separate preview-only rendering path. Imported Blob 15 and per-tile overrides therefore remain visible through the exact renderer that owns their exported pixels.
8. Save as many local configurations as needed from **My projects**.
9. Export a verified transparent PNG or the Godot ZIP. The pack contains aligned albedo, normal, height and AO atlases, a manifest, the editable recipe, a shader and the Godot importer.

Use `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) for history, `Ctrl+S` to save, `B` / `E` / `H` for paint, erase and pan, `G` for the grid, `F` or `Home` to recenter, `0` to reset the view, and `Shift+mouse wheel` or `+` / `-` to zoom from 25% to 800%. Wheel zoom stays anchored under the cursor. The materials, settings and atlas docks can all be resized and remember their dimensions.

The interface starts at 100% on standard desktop workspaces, 150% on QHD, 200% on 4K and 225% on 5K. Project settings only offers scale values that preserve at least a 1024 px logical workspace, so larger controls never create an unreachable canvas or inspector.

Configurations are stored in a versioned browser library and can be duplicated, deleted or exported as `.tesserae.json`. Legacy Tessera 47 storage and recipe files are migrated automatically. Rendering stays local: textures are never sent to a server. The editor does not mount or render the 47-state workspace behind the start screen, keeping blank-project startup immediate.

## Validation

```powershell
pnpm check
```

This gate also rejects machine-specific absolute paths and temporary development artifacts before build and test execution.

The production contract also has a headless CLI:

```powershell
pnpm cli validate .\terrain.tesserae
pnpm cli diff .\before.tesserae .\after.tesserae
pnpm cli smoke .\terrain.tesserae
pnpm cli build .\terrain.tesserae --out .\generated
pnpm cli catalog .\sand.tesserae .\grass.tesserae --out .\terrain-catalog.json
pnpm cli build-default --out .\godot-import-smoke
```

Godot packs pass a four-channel seam quality gate and include stable IDs, terrain semantics, a machine-readable report and `tesserae-probe.gd`. CI opens a generated smoke project in Godot 4.7 and proves that Blob 47, Dual Grid 16 and a cut-out overlay load as native TileSets, including gameplay layers and mixed transparent/opaque pixels. An inside cut-out Blob atlas contains the 47 terrain states plus one explicitly declared, non-terrain fill tile. `tesserae-cutout-overlay.gd` fills a bounded overlay once and lets terrain-connect replace it with the 47 carving states, keeping every TileMap cell on the same fixed grid. Direct publishing remembers the authorized project folder for fast iteration. Cliff PNGs repeat horizontally but preserve their authored vertical strip once by default; vertical repetition is explicit.

See the [TileSetter audit](docs/TILESETTER_AUDIT.md) for feature coverage and design decisions.

## Contributing and support

Bug reports, focused feature proposals and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting substantial work.

Tesserae is free and open source. If it saves you production time, you can [support its continued development through PayPal](https://paypal.me/ThomasGuilcher). Financial contributions do not purchase roadmap priority or privileged access; see [SUPPORT.md](SUPPORT.md).
