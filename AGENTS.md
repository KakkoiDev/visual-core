# visual-core agent router

You own the work from the user's request through a visible, working result.
Read the current project's AGENTS.md/CLAUDE.md/README first. Preserve its framework,
engine, visual language and working behaviors. This core owns reusable visual
recipes, design tokens and asset mechanics; the app owns content, state and UX.

## Route the intent

| Request | Read next |
|---|---|
| New app UI or improve an existing page | [Basecoat](recipes/basecoat.md), then [Web UI](recipes/web-ui.md) |
| Icon, small interface symbol | [Icons](recipes/icons.md) |
| Game icon, vector illustration, logo, diagram, card/button decoration | [SVG recipes](recipes/svg-recipes.md) |
| Procedural sprite, robot, ship, creature | [Procedural pixels](recipes/procedural-pixels.md) |
| Game character, monster, item, HUD icon, tile, pixel frame/button | [Pixel recipes](recipes/pixel-recipes.md) |
| Exact hand-edited pixel rows, frame animation | [Pixel art](recipes/pixel-art.md), [animation](recipes/animation.md) |
| Terrain, tiles, environment kit | [Tiles](recipes/tiles.md) |
| Game HUD or menu | [Game UI](recipes/game-ui.md) |
| Illustration, background, empty-state artwork | [Illustration](recipes/illustration.md) |
| Change a prior asset | [Revise](recipes/revise.md) |
| Add assets to a real project | [Integration](docs/project-integration.md) |
| Design another core repository | [Core standard](docs/core-repo-standard.md), [scaffold](templates/core/README.md) |

Start with the bundled tools, not invented component CSS or pixel rows. Versions,
local reference files and prerequisites are in [the toolbox](docs/toolbox.md).
Do not install a replacement library or browse for a guessed API.

For every visual task, finish with [verification](recipes/verify.md). Load only the
relevant recipe, not the entire repository. `python3 tools/visual.py catalog` lists
implemented commands and recipe-only capabilities. Do not invent commands.

## Working loop

1. Inspect the host and write a short brief: purpose, audience, primary action,
   mood, required states, target sizes, asset scale. Infer sensible defaults; ask
   only for choices that would materially change the result. Use the user's language.
2. Choose one existing recipe and preset. For a new no-framework UI use web-app;
   for procedural sprites use generate ship/robot/creature; use terrain template/create for procedural terrain and editable robot/manual
   terrain templates for exact pixels. Copy Basecoat markup from the component kit. Preserve existing systems.
3. Produce a small coherent result promptly. Keep theme, palette, grid and stroke
   width consistent. One primary action per view; text and spacing before ornament.
4. Render and inspect the actual result. Test UI interactions and inspect pixel
   art at native scale. Fix the largest visible problem, then check again.
5. Present a preview, editable source location and a short account of what changed.
   Distinguish automated checks, browser checks and visual judgment. Do not claim
   an unseen screenshot was reviewed. Report missing preview capability candidly.
6. For a follow-up, read current state and patch stable IDs. Preserve unaffected
   layers/frames, style and earlier revisions. Never rebuild to change one color.

## Boundaries

No credentials, generic agent loop, MCP service, chat persistence, game engine or
app navigation framework belongs here. Route new Kakkoi School browser games to
[LittleJS-AI](https://github.com/KilledByAPixel/LittleJS-AI), networking to
[p2p-core](https://github.com/KakkoiDev/p2p-core), and repository/deployment work to
[ai-handbook](https://github.com/KakkoiSchool/ai-handbook). Existing engines stay.
Do not duplicate those upstream handbooks or claim visual-core is integrated into
Pi merely because it was inspired by Pi. Today integration uses ordinary tools.

When adopting visual-core in a KakkoiDev project, register its exact URL, pinned
core commit, integration paths and verified consumer commit in IMPLEMENTATIONS.toml.
Only a verified dependency may be called a consumer; a copied starter is an example
unless its core provenance is retained and the integration is explicitly maintained.
Registry status must match evidence. Never invent a deployed consumer.

Contributors: run tools/validate.py and unittest. UI behavior changes also need the
browser checks in tests/README.md. Add regression tests for source validation,
state preservation or behavior changes. Do not test artistic quality with strings.
