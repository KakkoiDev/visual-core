# Content library

Starting packs that the pixel and SVG tools recombine. Every entry is data (named
parts or drawing steps), never a bitmap, so "the same sword, blue, bigger" is a
deterministic revision of one recipe.

| Pack | File | Contents |
|---|---|---|
| Palettes | content/palettes.json | meadow, dusk, arcade, ink; fallbacks, shade/light ramps, UI roles, colour names |
| Characters | content/pixel/characters.json | bodies small/medium/large; skins; hair short/long/tied/none/hood; outfits tunic/robe/armour/overalls; held none/sword/staff/bow/tool/book with rest and attack poses; faces calm/happy/angry/hurt; leg poses |
| Monsters | content/pixel/monsters.json | bodies blob/beast/flyer/knight; eyes dots/one/slits; extras crown/horns/wings |
| Items | content/pixel/items.json | potion, coin, sword, shield, key, gem, apple, mushroom, bomb, chest, scroll, bag, ring, each with recolourable slots, 16/32/64 px |
| Pixel icons | content/pixel/icons.json | heart, coin, potion, key, sword, shield, star, bag, gear, map, clock, lock |
| Tiles | content/pixel/tiles.json | grass, dirt, water, sand, flowers (seeded variants); stone, wood, brick, path |
| Buildings | content/pixel/buildings.json | walls wood/stone/brick, roofs gable/hip/flat/tower, doors none/wood/arch, 0–2 windows, chimney; 32/64 px |
| UI frames | content/pixel/frames.json | frame9 (dark or light panel), parchment, inset, button9 with four states |
| Pixel font | content/pixel/font.json | 3×5 capitals, digits, punctuation |
| Vector icons and pieces | content/vector/pieces.json | the 12 game icons; hero, monster, potion, grass, tree, cloud, sun, house, rock, flower, mountain, chest |
| Line font | content/vector/font.json | monoline capitals, digits, punctuation as path data |

Every library entry is a ready recipe: `python3 tools/visual.py pixel template item.gem`
(also `icon.gear`, `tile.water`, `frame.parchment`, `building.stone-tower`). `pixel
catalog` lists them under `library_templates`; edit the returned JSON, then create.

## Licences

Everything here is original to visual-core (MIT). The palettes, the 16 px hero,
slime, potion, coin, heart, grass, frame9, button9 and the vector hero, monster,
potion, grass and heart reproduce the Pi Workbench designer's Art cards
(ArtPalettes, ArtSprites, ArtFrames, ArtReferenceSet), which are original to that
kit. No third-party sprites, fonts or icon sets were copied. A test fails if a pack
file lacks its licence line. Do not add art traced from known games.

## Adding to a pack

Add 16 px parts as fill grids (the renderer adds the outline) and 32 px parts as
drawing steps in a 32-unit grid; keep role keys (r/R for outfits, g/G/l for
monsters, slot keys for items) so recipes can recolour them. Run the unit tests:
pack drawings go through the same validator as recipes and every entry is rendered
at every size. Then look at the result at 1× and 4× on paper and on the panel.
