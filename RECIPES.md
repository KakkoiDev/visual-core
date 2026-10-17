# Recipe index

Choose by the user's outcome. The agent chooses the recipe, not the user.

| Outcome | Recipe | Executable starting point |
|---|---|---|
| Responsive app interface | [Web UI](recipes/web-ui.md) | `init web-app` |
| Consistent SVG icon | [Icons](recipes/icons.md) | `template icon`, `create` |
| Pixel sprite or prop | [Pixel art](recipes/pixel-art.md) | `template robot`, `create` |
| Tile kit | [Tiles](recipes/tiles.md) | `template terrain`, `create` |
| Animation preview | [Animation](recipes/animation.md) | atlas + host browser/engine; recipe only |
| HUD and game menus | [Game UI](recipes/game-ui.md) | existing engine/DOM; recipe only |
| SVG illustration | [Illustration](recipes/illustration.md) | direct SVG editing; recipe only |
| Targeted changes | [Revise](recipes/revise.md) | `read`, `revise --base --patch` |
| Prove the result | [Verification](recipes/verify.md) | tests + browser + actual visual inspection |

Commands above are subcommands of `python3 tools/visual.py`. Their complete syntax
is available through `--help`. No unlisted export/render/model command exists.
