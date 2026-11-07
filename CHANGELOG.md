# Changelog

## 0.7.1

- OpenUI theme: `foreground` is OpenUI's surface colour (cards, the composer), so it now comes from `--card`, not the text
  colour. With the text colour there, OpenUI drew its composer black on black in light mode.

## 0.7.0

- Kakkoi theme: Latin woff2 subsets of Bebas Neue (14 KB) and Inter (31 KB, optical size 14, weights 400–700), loaded
  by `themes/kakkoi/kakkoi-fonts.css`. The notices record how they were made and their hashes, and the theme scenario
  checks both. Japanese uses the system font until Noto Sans JP is sliced.

## 0.6.0

Add theme tools: `visual.py icons` draws a plain SVG mark into square PNGs at the favicon, Apple touch and web
app manifest sizes (deterministic, standard library, text and images refused by name), and `visual.py theme-openui`
maps a theme's tokens onto OpenUI's ThemeProvider overrides. The Kakkoi theme ships both outputs, and its scenario
checks they match a fresh export.

## 0.5.0

Add the Kakkoi theme (`themes/kakkoi/`), the designer's hand-back of 7 Nov 2026: Basecoat 1.0.2 token values for
light and dark (monochrome, colour only for error, success and warning, radius 0), the theme CSS with type roles
and primitives, a 2.7 KB inline subset for generated apps (system fonts only), the KAKKOI and KAKKOIDEV wordmarks,
the cube mark, app icons (light, dark, maskable) and a generated-app icon template, Bebas Neue, Inter and
Noto Sans JP (all SIL OFL 1.1), and the style described in rules an agent can apply. A scenario keeps the CSS, the inline subset
and the contrast claims in step with `kakkoi-tokens.json`.

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

Add the content library: eight more items, the full 12 pixel HUD icons, eight more
tiles (five with seeded variants), buildings from walls/roofs/doors/windows at
32/64 px, parchment and inset frames, eight vector pieces and a meadow scene. Every
library entry is a ready recipe (`pixel template item.gem`). All original (MIT).

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
