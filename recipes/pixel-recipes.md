# Pixel art from recipes

**Outcome:** characters, monsters, items, icons, tiles, UI frames and buttons in the
kit's four palettes, as PNG sheets with a manifest a game reads. You pick names and
numbers; the tool draws every pixel. Never write pixel rows for these kinds.

```sh
python3 tools/visual.py pixel catalog              # every kind, part, item, palette, action
python3 tools/visual.py pixel template hero > hero.json
python3 tools/visual.py pixel check hero.json      # errors name the field and the choices
python3 tools/visual.py pixel create hero.json --out assets/visual/hero
python3 tools/visual.py pixel read assets/visual/hero
python3 tools/visual.py pixel revise assets/visual/hero --base 1 --patch patch.json
```

Templates (`pixel catalog` lists them): hero, slime, boss-slime, potion, sword, grass,
heart, button, dialogue-frame, gem-sprite. They reproduce the designer's reference set.

## Pick a recipe

Every recipe has `"schema": "visual-core.pixel/1"`, a `kind` and a short `id`.

| Kind | Fields you choose |
|---|---|
| character | `size` 16/32/64, `parts`: body small/medium/large, skin s/o/n, hair {style short/long/tied/none/hood, key}, outfit {style tunic/robe/armour/overalls, colour or keys}, held none/sword/staff/bow/tool/book, face calm/happy/angry/hurt; `frames` |
| monster | `size`, `parts`: body blob/beast/flyer/knight, eyes dots/one/slits, colour, light, extra none/crown/horns/wings; `frames` |
| item | `name` (potion, coin, sword, shield, key…), `size`, `keys` per slot (`pixel catalog` lists slots) |
| icon | `name` (heart, coin, potion, key, sword, shield, star), 16 px |
| tile | `name` (grass), `detail` low/medium/high, `variants_count` 1–4, `seed` |
| frame | `width`, `height`, `fill` p (dark) or w (light) |
| button | `width`, `height`, `fill` [face, shade], `states` normal/focus/pressed/disabled, `label` |
| sprite | free drawing: `width`, `height`, `ops` (rect, ellipse, circle, line, poly, pixels, dither, outline, shade, mirror, swap, scatter, text, part), optional `frames` |

Common fields: `palette` meadow (default, daylight), dusk (night, dungeons, space),
arcade (shooters, puzzles), ink (visual novels, cards); `swap` (key → key for the
whole asset); `variants` [{"name": "blue", "swap": {"r": "b", "R": "B"}}] for extra
sheets with the same frames; `seed` for repeatable small variations.
Colour names: red, blue, green, gold, grey, brown, white, dark.

`frames` are fixed per action: idle 2, walk 4, attack 3 (needs a held item), hurt 2,
die 4, with the designer's timings. `{"idle": 2, "walk": 4}` renders two rows.
Sizes: one size per game for characters; scale on screen by whole numbers only.

## Read the output

A numbered revision folder holds sheet.png (and sheet-<variant>.png), preview.png
(enlarged on paper and on the dark panel, for showing in chat), manifest.json,
spec.json (the editable, resolved recipe) and preview.html. Use the manifest's frame
rectangles, ids (`walk-2`), `ms` and bottom-centre pivot; never assume the order.
`quality` lists automated checks (palette only, fits the canvas, outline, tile
detail ratio). `visual_review: not-performed` means nobody has looked yet: look.

## Change it

Read first, then patch with the current revision as base. `set` merges objects,
replaces other values, and `null` returns a field to its default:

```json
{"set": {"size": 32, "keys": {"blade": ["b", "B"]}}}
```

That is "the same sword, blue, bigger": revision 2 beside an untouched revision 1.
A patch that changes nothing publishes nothing (`"unchanged": true`). A stale base,
an invalid patch or a failed render keeps the current revision. `schema`, `kind` and
`id` cannot change; make a new asset instead. If `check` or `revise` fails, fix the
fields it names (it lists the allowed values) and retry at most twice.

## Limits

Deterministic drawings from the packs in content/pixel, not arbitrary art. 32 and 64
px parts are drawn from shapes and shaded by rule; they are simpler than the 16 px
hand-placed art. There is no animation player or GIF export; see [animation](animation.md).
