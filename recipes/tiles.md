# Terrain and tile kits

For procedural terrain use the local pinned engine; do not invent pixel rows.
Three presets: meadow (grass/dirt), coast (sand/water), dungeon (stone/void).

```sh
python3 tools/visual.py terrain catalog
python3 tools/visual.py terrain template meadow > recipe.json
python3 tools/visual.py terrain check recipe.json
python3 tools/visual.py terrain create recipe.json --out assets/visual/meadow
python3 tools/visual.py terrain read assets/visual/meadow
```

The recipe allows seed, tile_size (16/32/64), palette, detail (low/medium/high),
contour.profile (soft/square), contour.border_px and variants (1..4). It uses
Blob 47 topology only. Presets and palettes are in [the implementation](../src/terrain.py).
Read the generated recipe.json instead of guessing optional fields.

A numbered revision contains atlas.png, base.png, manifest.json,
preview-native.png, preview.html, recipe.json, resolved.json, generator.json,
specimen.json, quality.json and upstream licenses. Foreground is transparent;
composite it over the repeatable base tile. Use manifest rectangles and bit_order;
never assume atlas ordering. Variants are stacked in 12×4 groups. The declared
unused cell stays transparent. Nearest sampling, mipmaps disabled, zero padding.

For “less busy, keep the same terrain,” read first and write this patch:

```json
{"set":{"detail":"low"}}
```

```sh
python3 tools/visual.py terrain revise assets/visual/meadow --base 1 --patch patch.json
```

Patches can change palette, detail, contour or variant count. Seed, identity,
preset, topology and tile size require a separate named set. Existing variant
indices/pixels are preserved when adding variants. Palette/detail revisions keep
tile IDs/rectangles. A no-op does not create a revision. Stale bases, writer locks,
toolchain changes and render failures preserve the current revision.

The final RGBA pixels pass every compatible mask/variant edge check and base
repeat checks before publication. They use six palette colors and binary alpha.
This proves bounded pixel contracts, not artistic excellence. Inspect the native
specimen and atlas in a real map; prevent repetition and maintain sprite contrast.
No animation, cliffs, arbitrary material junctions, Godot/Tiled export or world
map generation is claimed in this first release. Dual Grid remains a tested
upstream building block, not a public terrain command.

[Manifest consumer example](../examples/terrain-viewer/index.html) reconstructs
[the bundled meadow](../examples/meadow/0001/preview.html) from actual atlas
rectangles and specimen cells; serve the repository locally for fetch calls.

The original manual `template terrain` + `create` command remains available for
its three editable 16×16 grass/soil/water frames. It is a separate static sheet,
not this procedural terrain recipe. See the [design](../docs/terrain-generator-spec.md)
and [dependency kit](../docs/terrain-dependencies.md) for background and deferred work.
