# Changelog

## 0.4.0

Add deterministic pixel recipes (`visual.py pixel`): the kit designer's four named
palettes with fallbacks and UI roles, integer-only primitives (rect, ellipse, line,
polygon, dither, outline, light-direction shading, mirror, scatter, pixel text),
characters and monsters from named parts at 16/32/64 px, idle/walk/attack/hurt/die
rows from part transforms, items with recolourable slots, HUD icons, seeded tile
variants, 9-slice frames and button states. Sheets, previews and a manifest of
rectangles, names and timings; numbered revisions; no-op patches publish nothing;
errors name the field and its allowed values. The designer's reference hero, slime,
potion, coin, heart, grass, frame and button are reproduced pixel for pixel.

Add deterministic SVG recipes (`visual.py vector`): 12 game icons, the designer's
vector hero, monster, potion and grass, illustrations with row/column/grid layout,
logos with an emblem and badge, diagrams with arrows, cards, panels, buttons,
badges and dividers, and free drawings on a grid. Text uses a bundled original line
font drawn as paths. Output is allowlisted SVG (no scripts, styles or external
references) and a PNG preview from a small built-in rasteriser.

## 0.3.0

Add pinned headless terrain dependencies, meadow/coast/dungeon Blob 47 generation,
final RGBA seam checks, six-color palettes, map specimens, editable recipes and
numbered revisions. Include a manifest-based browser consumer. Organize all 41
Basecoat component guides into a local catalog with copyable snippets; Chart is
reference-only. Add production terrain tests and offline catalog browser checks.

## 0.2.0

Bundle and lock Basecoat UI 1.0.2, Pixel Sprite Generator 0.0.2 and 50 Lucide
1.59.0 icons, with original documentation/licenses and per-file hash checks.
Replace the starter component foundation with Basecoat, add a working component
kit, seeded sprite commands/provenance and local-first recipes. Preserve earlier
asset revisions and legacy icon IDs. Node.js 18+ is required only for procedural
generation. Add offline browser checks and upstream contract tests.

## 0.1.0

Initial agent router and opinionated recipes; native web UI starter and scoped CSS;
deterministic SVG icons and pixel atlases; immutable source revisions; consumer
integration guide; reusable core-repository scaffold; structural and browser checks.
No live pi-local-harness integration or external consumer is claimed.
