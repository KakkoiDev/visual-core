# SVG icon set

The catalog uses 50 bundled Lucide SVGs, pinned at 1.59.0. The CLI preserves the
legacy arrow/close/robot/coin names as aliases. Choose an existing catalog shape;
do not draw a replacement. Keep LICENSE-lucide.txt alongside exported assets.

For game HUD icons in the kit's vector style (ink outline plus one fill), use
[SVG recipes](svg-recipes.md); pixel HUD icons are in [pixel recipes](pixel-recipes.md).

**Outcome:** consistent small icons, not mixed clip-art styles.
**Defaults:** 24 px viewBox, 2 px stroke, rounded caps, one ink color. Existing sets
keep their own convention. Run `python3 tools/visual.py catalog` for every available shape. For an existing
app, retain its current icon system instead of mixing sets.

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
