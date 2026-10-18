# Ownership and limits

visual-core owns visual design defaults, routeable recipes, deterministic pixel
and icon sources, validation, revision mechanics and a portable UI starter.
Consumers own user journeys, application behavior, storage, authentication,
frameworks, engines, deployment and the decision to accept an aesthetic result.

Third-party code is bundled and locked, with no runtime package download. Python
3.11+ runs the CLI; Node.js 18+ runs the upstream procedural sprite adapter;
browsers consume prebuilt Basecoat CSS/JS. See docs/toolbox.md for exact pins.
The web starter is native HTML/CSS/JavaScript with local browser storage only.
It is not a production account system, sync layer or complete application.

Pixel specs support 1–64 px width/height, 1–32 equal-size frames, up to 16 opaque
RGB colors, transparency through `.`, and frame timing 40–2000 ms. Frame IDs are
stable. The horizontal sheet is PNG RGBA8 and SVG; atlas coordinates use pixels.
There are no arbitrary vector paths, image imports, AI image generation, PNG
conversion for icons, animated image export, tweening, arbitrary layers, Aseprite
scripts or image-understanding models. Icons use 50 pinned Lucide shapes and four legacy aliases; no arbitrary model
SVG is accepted by the icon command. Procedural generation uses three bounded
upstream masks (ship/robot/creature), not a universal pixel-art generator.
The illustration, game UI and animation recipes use the host's normal tools.

Pixel recipes (`visual.py pixel`) draw characters, monsters, items, icons, static
tiles, 9-slice frames and buttons only from the named parts and drawing steps in
content/pixel, in the four kit palettes, at 16/32/64 px (frames and buttons up to
256 px). Animation rows are fixed per action (idle, walk, attack, hurt, die).
There is no free-form image input, rotation, anti-aliasing or interpolation.

Assets keep immutable numbered revisions. Revisions can patch existing pixel
frames/timing/palette or icon shape/size/stroke/color, not frame topology or asset
kind. Create a separate named asset when changing dimensions or frame count.
The asset directory is local authoring data, not a security sandbox or multi-user
store. A crashed revision may leave a `.revision-lock`; inspect the process and
current revision before removing a stale lock. Never delete an active writer's lock.

Structural validation is not aesthetic review. Contrast ratios cover supplied
color pairs, not gradients, all rendered states, icons on images or entire pages.
Keyboard, content, zoom, assistive technology and user testing remain separate.
The browser smoke suite is optional dev tooling, never a hidden production service.

Procedural terrain uses the pinned Tesserae shape renderer plus seeded material
adapter, supporting Blob 47 at 16/32/64 px with 1..4 variants and six-color binary
alpha output. It does not provide native engine export, cliffs or world generation.
Basecoat has 41 organized component references; Chart.js is not bundled.
