# SVG icon set

**Outcome:** consistent small icons, not mixed clip-art styles.
**Defaults:** 24 px viewBox, 2 px stroke, rounded caps, one ink color. Existing sets
keep their own convention. The executable catalog offers check, close, arrow,
heart, star, coin and robot; other shapes need direct SVG work and visual review.

```sh
python3 tools/visual.py template icon > confirm.json
python3 tools/visual.py check confirm.json
python3 tools/visual.py create confirm.json --out assets/visual/confirm
```

Edit name, shape, size, stroke and color in the JSON before create. Names are stable
asset IDs. Output: 0001/asset.svg, editable spec.json, preview.html and manifest.json.
The SVG contains only curated geometry, not arbitrary input markup.

Inspect at 16, 24 and 32 px; check optical weight and meaning. Keep padding and
stroke consistent across the set. Color contrast must be checked against actual
backgrounds. Do not put text inside a tiny icon or rely on an icon as the only
label for an unfamiliar action. No SVG-to-PNG command is implemented.
For follow-ups use [revision](revise.md); present the exported SVG and source.
