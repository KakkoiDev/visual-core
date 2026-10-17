# Use visual-core in a project

Tell the agent the repository URL and the result you want. It reads the host's
instructions, chooses a recipe, creates an initial result and shows it for review.
No plugin, model service or MCP server is required. A locally running coding agent
can use the same files and commands as a hosted one. Read [the local toolbox](toolbox.md)
for exact bundled versions, prerequisites and upgrade rules.

## New interface

```sh
python3 /path/to/visual-core/tools/visual.py init web-app --out /path/to/new-app
python3 -m http.server 8080 --directory /path/to/new-app
```

The new folder must not already exist. The starter has a working create dialog,
search, filtering, completion, empty state and local persistence. Test these with
realistic content and replace the example board behavior with the app's needs.
An existing app should use its current components and build system; read the web
recipe rather than scaffolding over it.

The init command also copies Basecoat prebuilt CSS/JS and Basecoat/Tailwind licenses
into vendor/basecoat/. It records tool versions, CSS and runtime file hashes in
vendor/visual-core/provenance.json.
Record the Git commit used in the consumer's dependency notes. Upgrades are explicit:
review the CSS diff and rerun the consumer checks; do not overwrite local changes.
A vendored style copy is not a live dependency that updates itself.

## Assets and chat revisions

```sh
# Default for procedural sprites: no handwritten pixel rows needed.
python3 /path/to/visual-core/tools/visual.py generate ship --seed 42 --out assets/visual/ship
# For exact frame authoring/editing:
python3 /path/to/visual-core/tools/visual.py template robot > robot.json
python3 /path/to/visual-core/tools/visual.py create robot.json --out assets/visual/robot
python3 /path/to/visual-core/tools/visual.py read assets/visual/robot
```

The asset contains current.json and 0001/, 0002/, etc. A revision contains spec.json,
sheet.png/sheet.svg/atlas.json (pixels), or asset.svg (icons), plus preview.html and
manifest.json. Procedural sprites also keep generator.json and the upstream notice;
icons keep LICENSE-lucide.txt. Retain the corresponding license when copying an
approved output into the application. Ask, for example: “Make the robot eyes amber; keep the body, size
and animation.” The agent reads first and patches the affected palette/frame IDs.
For each reply show the image or live browser preview and link the current source.
A CLI result alone does not attach an image to arbitrary chat software; the host
agent must present the returned local files. Native Pi attachment integration is
not part of this repository.

Keep authoring files together under assets/visual/. Copy an approved numbered
output to your app's public/assets/ folder (or the engine's resource folder).
Subsequent revisions do not silently update that release copy. For a website:

```html
<img src="/assets/confirm.svg" alt="Confirmed" width="24" height="24">
<img src="/assets/robot.png" alt="Robot animation frames" class="vc-pixel">
```

The PNG is a horizontal sheet, not automatically an animation. Use atlas.json to
crop a frame with canvas drawImage or your engine's texture atlas API. Timings are
per frame, in milliseconds. The pivot is bottom-center. See the animation recipe.
Decorative icons should have an empty alt; controls still need their own label.

For a matching set, reuse the palette and source conventions, not unrelated
random images. Keep generated sources in version control according to the app's
asset policy; do not vendor an entire Python environment or global model files.
When registering a consumer, use the exact core and consumer commits and real
integration paths in IMPLEMENTATIONS.toml. Do not change another repo's registry
or claim integration until the consumer actually uses the core and passes checks.
