# Ownership and limits

visual-core owns visual design defaults, routeable recipes, deterministic pixel
and icon sources, validation, revision mechanics and a portable UI starter.
Consumers own user journeys, application behavior, storage, authentication,
frameworks, engines, deployment and the decision to accept an aesthetic result.

Runtime dependencies: zero. Python 3.11+ generates files; browsers consume them.
The web starter is native HTML/CSS/JavaScript with local browser storage only.
It is not a production account system, sync layer or complete application.

Pixel specs support 1–64 px width/height, 1–32 equal-size frames, up to 16 opaque
RGB colors, transparency through `.`, and frame timing 40–2000 ms. Frame IDs are
stable. The horizontal sheet is PNG RGBA8 and SVG; atlas coordinates use pixels.
There are no arbitrary vector paths, image imports, AI image generation, PNG
conversion for icons, animated image export, tweening, arbitrary layers, Aseprite
scripts or image-understanding models. Icons use seven original curated shapes.
The illustration, game UI and animation recipes use the host's normal tools.

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
