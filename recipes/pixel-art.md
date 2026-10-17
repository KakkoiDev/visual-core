# Pixel sprite or prop

**Outcome:** a readable small sprite with matching palette and editable frames.
**Defaults:** 16×16, transparent `.`, up to five colors, bottom-center pivot.

```sh
python3 tools/visual.py template robot > robot.json
python3 tools/visual.py create robot.json --out assets/visual/robot
```

Use the [sprite composition pattern](../docs/composition-patterns.md). Start from the preset and edit its rows for the requested character/prop. Each
row has exactly width characters. Palette keys are 0–9/A–Z, and `.` means transparent.
Keep the same outline/body/highlight roles. Frames use lowercase stable IDs,
equal dimensions and ms durations. Do not generate a whole animation before the
first silhouette reads well. Render a small result promptly, then revise.

The renderer exports transparent RGBA PNG and crisp SVG sheets, atlas.json with
frame coordinates and durations, source JSON, metrics, hashes and an HTML preview.
There is no neural image generation or image importer hidden in this command.
Inspect at native size and 8× nearest-neighbor; check no clipping, unintended
holes, drifting pivot or unrelated changes between frames. See [animation](animation.md).

A successful render only proves valid pixels. Present the image, not just a list
of files. For a chat revision, read and patch one frame/palette as described in
[revise](revise.md); retain the original frames and source history.
