# Frame animation

**Outcome:** a stable silhouette moving clearly at the target display scale.
This is an integration recipe; there is no GIF/video export or tween generator.

1. Start with a readable idle sprite. Add a small second pose, keeping canvas size,
   palette roles and bottom-center pivot stable. Build the frame set at creation;
   normal revisions patch existing IDs rather than adding/removing frames.
2. Render with the pixel recipe. Read atlas.json, not guessed sheet dimensions.
   Each frame has x/y/width/height, ms and pivot in pixels.
3. In the host's existing engine, map frame rectangles and advance by each frame's
   ms. For a plain browser, use canvas.drawImage(image, x,y,w,h, dx,dy,w*scale,h*scale)
   with imageSmoothingEnabled=false. Preserve the engine's update loop; do not add
   a second requestAnimationFrame loop to a game engine.
4. Compare idle and motion at native scale. Test at least one complete loop; inspect
   foot/pivot drift, clipping, flicker and an abrupt last-to-first transition.
5. Supply a pause option for nonessential animation, respect prefers-reduced-motion,
   and show a static first frame when motion is disabled. Check interaction states.

An atlas preview shows all frames; it is not proof the animation has been played.
If motion was not run, say so. Keep source, atlas and reviewed PNG together.
