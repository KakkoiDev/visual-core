# Game HUD and menus

**Outcome:** legible game information and controls without hiding the game.
**Inputs:** existing engine, safe content area, keyboard/touch controls, score/health,
start/pause/restart states, and the game's palette.

1. Preserve the engine and game loop. Place only persistent essential information
   in the HUD. Use consistent corners and a clear hierarchy; reserve the center
   for play. Do not replace readable numbers with decorative art.
2. Use the engine's existing UI facilities, or a DOM overlay if that is already
   the host's pattern. Decorative overlays must not intercept game pointer input.
   Actual buttons must remain focusable, labeled and reachable.
3. Match the sprite palette and density, but use readable normal UI text where
   pixel lettering is too small. Include text/numbers as well as health colors.
4. Test on a narrow viewport, during action, while paused, after losing and after
   restarting. Verify touch areas and keyboard focus; do not leave focus trapped.
5. Run [verification](verify.md), including the real core game loop.

For a new Kakkoi School browser game, route engine creation to
[LittleJS-AI](https://github.com/KilledByAPixel/LittleJS-AI). Use
[p2p-core](https://github.com/KakkoiDev/p2p-core) for multiplayer. Those are upstream
authorities, not dependencies installed by visual-core. Do not copy their manuals.
