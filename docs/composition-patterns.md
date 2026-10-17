# Patterns a small agent can follow

Choose the pattern closest to the task. Keep the host's established visual language;
these are composition constraints, not commands or a new component library. Write
a three-line brief (primary task, content hierarchy, style), then build one view.
Do not combine every pattern on one screen.

## A useful app screen

**Use for:** task boards, notes, collections, inventories. Start from web-app.
Header: short identity, one optional context control. Main: task-oriented title,
one sentence, one primary action. Put search/filter beside the collection rather
than in a decorative hero. Cards contain a short title, one useful detail and a
real action. A single-item collection can use a list; cards are not mandatory.

**States:** first-use empty with an action; no matching results with a clear filter;
populated; completed; actual storage or request failure. Never invent numbers to
fill a dashboard. On phones, place tools in reading order and stack them before
the collection. Keep the primary action reachable without horizontal scrolling.

## A focused editor

**Use for:** pixel, music or document editors. Preserve the existing editor engine.
Toolbar: title, save/export state and one primary action. Center: the artifact at
the user's target scale. Side panel: a small group of controls relevant to the
selection. Put advanced controls behind disclosure. On phones, show the preview
before controls; use one column instead of shrinking three columns.

**States:** nothing selected, current selection, dirty/saved, undo or prior revision,
failed export. A color change must not erase shapes, timing or another selection.
If the tool has no save endpoint, state where the file is stored rather than
displaying an invented saved status.

## A game menu or HUD

**Use for:** pause, inventory, health and score. Read the game-ui recipe and retain
the engine. Reserve the playable center; use compact edge-aligned groups. Name
health/items with text or recognizable symbols as well as color. One menu panel
has one title and a vertical set of real actions: resume, settings, exit if supported.
Use the same outline, palette and pixel scale as the game's sprites.

**States:** playing, paused, navigation focus, settings open, confirmation only for
actual destructive actions. Pause must stop the intended simulation and resume
must return focus to play. Do not introduce a separate game loop for the HUD.

## A small readable sprite

**Use for:** 16×16 characters, pickups and props. Start with a silhouette in one
color; fill the body with a middle value, then one highlight. Put the focal feature
(eyes, gem, switch) in a high-contrast cluster, not isolated noise. Keep the ground
contact and bottom-center pivot consistent. Use at most five colors by default.

For a creature: head/focal cluster in the upper half, body in the middle, clear
feet/contact at the bottom. For a pickup: a compact centered silhouette with one
recognizable symbol. For an idle: change one or two rows deliberately and hold
for 160–400 ms; avoid unrelated pixel changes across the whole frame.

## A coherent tile kit

**Use for:** small ground/environment sets. Share one dark, one middle and one
light family across tiles. Keep noisy texture behind the character. For seamlessly
repeating ground, make opposite borders compatible; test a 3×3 repeat. A three-tile
starter is not a complete autotile system: add named edge/corner tiles only when
the engine's adjacency rules are known. Do not treat the tile sheet as an animation.

## A simple SVG illustration

**Use for:** empty states, app mascots and backgrounds. Three depth groups:
background support, one focal silhouette, one small accent. Use 3–5 large shapes,
stable group IDs and a single light direction. Leave space where HTML text or
gameplay lives. Remove detail until the focal object reads at the actual display
size. A small leaf/robot/tool can support a page; repeated decorative blobs rarely do.

## A restrained style choice

For new apps, the shipped warm-paper/teal tokens are the default. For a cozy pixel
game, begin with the robot/terrain palette and keep warm highlights, dark outlines
and quiet backgrounds. For another mood, change semantic color roles together;
do not recolor each component independently. Keep one font family, one spacing
rhythm and one icon stroke. Check foreground/background contrast after any theme
change with the contrast command and the real rendered interface.

Finish using [verification](../recipes/verify.md). A valid source is not evidence
that the composition is attractive or the user can complete the task.
