# SVG from recipes

**Outcome:** game icons, small illustrations, logos, diagrams and UI decorations in
the kit's vector style (2 px ink stroke, round caps, palette fills, hard shadows),
as clean SVG plus a PNG preview. You choose pieces, text, keys and layout; the
tool writes every path. Do not write SVG path data for these kinds.

```sh
python3 tools/visual.py vector catalog            # icons, pieces, shapes, layouts, font characters
python3 tools/visual.py vector template title-logo > logo.json
python3 tools/visual.py vector check logo.json
python3 tools/visual.py vector create logo.json --out assets/visual/logo
python3 tools/visual.py vector revise assets/visual/logo --base 1 --patch patch.json
```

Templates: heart-icon, potion-icon, reference-set, title-logo, flow-diagram,
start-button, card-frame, flag-drawing.

| Kind | Fields you choose |
|---|---|
| icon | `name` heart, coin, potion, key, star, gear, map, bag, sword, shield, clock, lock; `size` 16/24/32/48 (stroke 1.5 at 16); `fill` (its one colour); `stroke` |
| illustration | `width`, `height`, `background`, `items` [{"piece": "hero"}, {"piece": "icon.star", "scale": 2}], `layout` {type row/column/grid/none, gap, align, padding, columns}, optional `shapes` |
| logo | `text` (up to 24 capitals), `emblem` (an icon name), `layout` row/column, `badge` none/round/pill/square, `colours` {text, badge, emblem}, `size` |
| diagram | `nodes` [{"id", "label", "fill"}], `edges` [{"from", "to"}], `layout` row/column/grid, `columns`, `fill` |
| decoration | `type` card/panel/button/divider/badge, `width`, `height`, `fill`, `label`, `shadow` |
| drawing | `width`, `height` in grid cells, `grid` (cell size), `shapes` (rect, circle, ellipse, line, polyline, polygon, path, text) |

Colours are palette keys (`pixel catalog` names them), never hex. Text is drawn
with the bundled line font (capitals, digits, `. , ! ? - : ' + / &`), as paths,
so the SVG needs no font file. Pieces and icons from the designer's reference set:
hero, monster, potion, grass, and every icon as `icon.<name>`.

Output per revision: asset.svg, preview.png (rendered by visual-core's own
rasteriser, for chat), spec.json, manifest.json (groups, hashes, safety checks),
preview.html. The SVG contains only svg, title, g and basic shapes: no scripts,
styles, links, images or external references.

Change: `{"set": {"fill": "b", "size": 48}}` makes "the same potion icon, blue,
bigger". No-op patches publish nothing; stale bases and invalid patches change
nothing. Check contrast for text on a badge (the tool refuses below 4.5:1).
