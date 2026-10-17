# Tile kit

**Outcome:** tiles that share scale, palette and light direction in a real map.

```sh
python3 tools/visual.py template terrain > terrain.json
python3 tools/visual.py create terrain.json --out assets/visual/terrain
```

This preset contains grass, soil and water as three 16×16 frames in a horizontal
atlas. They are static tiles, not a three-frame terrain animation. The shared
pixel renderer makes sheets; it does not generate autotile rules or a map engine.
Treat each frame ID as a tile ID and use its atlas rectangle in the host engine.

Use the same pixel density and color roles as the characters. Test a 3×3 repetition
of each tile and a mixed neighborhood, at native scale and game scale. Fix edge
seams and distracting repetition before adding detail. A complete bordered terrain
set needs center, edges and corners designed deliberately; the shipped three-tile
preset does not claim to provide those transitions. Document missing transitions.
Keep tile IDs stable across revisions; topology changes require a new named set.
