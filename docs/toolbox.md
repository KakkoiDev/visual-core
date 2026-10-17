# The local, locked visual toolbox

Terrain development also has a [gathered dependency kit](terrain-dependencies.md):
six pinned upstream sources, prebuilt headless JavaScript and executable probes.
The terrain adapter now implements Blob 47 creation/revision; see recipes/tiles.md.
The broader candidate kit remains development/reference material.

After cloning visual-core, the working tools, prebuilt assets, licenses and selected
upstream documentation are already present. Routine generation and preview require
no network, package install, build tool, art application or MCP server.

Prerequisites: Python 3.11+; Node.js 18+ for procedural sprites and terrain; a modern browser for
UI and visual review. Those system runtimes and a coding model are not bundled.
Optional browser test tooling is documented separately in [tests](../tests/README.md).

| Tool | Pin | Local material | Role |
|---|---|---|---|
| Basecoat UI | 1.0.2; source 6953a4adbe63cb5ba25e2bda30d7b76202d4f2b4 | vendor/basecoat/ | Full published package, prebuilt CSS/JS, Jinja/Nunjucks macros, upstream component docs |
| Pixel Sprite Generator | 0.0.2; 8c2cee790b0ae5885319181e56745ae45a0f8138 | vendor/pixel-sprite-generator/ | Seeded procedural mask geometry via tools/pixel_generator.cjs |
| Lucide | lucide-static 1.59.0 | vendor/lucide/ | 50 curated original SVG files plus four legacy name aliases in the CLI |
| Tailwind CSS | 4.3.1 | vendor/tailwindcss/ | License/metadata for CSS already compiled into the Basecoat bundle; no Tailwind runtime/build dependency |

Use [Basecoat](../recipes/basecoat.md), [procedural pixels](../recipes/procedural-pixels.md)
and [icons](../recipes/icons.md). The core also keeps its bounded PNG/SVG renderer
and editable manual robot/terrain sources for precise edits and existing assets.

## Lock and license contract

vendor/LOCK.json records versions, source URLs/commits, archive integrity where
available and SHA-256 for every vendored file. Upstream files are unchanged. Run:

```sh
python3 tools/vendor.py check
python3 tools/validate.py
```

Every visual.py command also verifies the vendor lock before loading upstream code.
This verifies the checked-in files against the checked-in lock; it is not an
independent security audit or protection against someone changing both together.
Normal recipes never download code, use latest, or refresh the lock automatically.
Keep the original MIT/ISC notices. Generated icon assets include LICENSE-lucide.txt;
procedural sprites include LICENSE-pixel-sprite-generator.txt. Init copies Basecoat
and Tailwind notices beside its runtime files. Retain these when shipping assets.
The root MIT license covers visual-core's original adapters/recipes, not a change
to third-party terms. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Explicit upgrade process for maintainers

1. Choose an exact reviewed version/commit. Fetch registry archives with npm pack
   PACKAGE@VERSION --ignore-scripts into a temporary directory, or fetch the exact
   Git commit. Compare registry integrity and inspect source/license/API changes.
   Routine users do not need npm or GitHub access for already-bundled tools.
2. Replace only the relevant vendor subtree. Preserve files byte-for-byte. For
   Basecoat, use the published package plus site/src/docs from the matching source
   commit. For PSG, keep its engine, license, package/README and example masks.
   For Lucide, retain the curated SVG subset and complete original LICENSE.
3. Update that source's version, revision/archive provenance and per-file SHA-256
   entries in vendor/LOCK.json. Review that diff with the upstream changes; never
   resolve a hash failure by silently re-locking unknown files.
4. Adapt the small wrapper and local recipes to the actual new API. Run validation,
   contract tests and offline browser tests; inspect screenshots. Run relevant
   weak-model cases before claiming that a model can use the changed workflow.
5. Commit lock, source, notices, adapters, examples and changelog together. Consumers
   pin a visual-core commit and explicitly review upgrades; vendored app copies do
   not update themselves. No background dependency update runs during generation.

Re-fetching exact locked versions is possible from the recorded origins. Building
Basecoat from source is an optional upstream-maintainer task; ordinary users copy
its already compiled distribution. This repository does not promise bit-identical
rebuilds of a future upstream release from an unpinned build environment.

## Why this selection

Basecoat supplies mature markup and interaction implementations. Lucide supplies
consistent symbols. PSG supplies a small inspectable procedural algorithm and clear
MIT terms. PixelForge was inspected at de85a88806c396484264f57e66c9bc0956b39982
but not bundled: the README's generate(spec) API does not match the checked-in
positional generate(name,res,palette,params) API, and a generator uses Math.random.
Do not route a weak agent through unverified examples just because a feature list
looks broad. Add another tool when a concrete task needs it and it passes the same
locality, licensing, versioning and behavior checks.

See [all Basecoat components](basecoat-components.md) for 41 organized local guides,
copyable snippets, runtime requirements and offline previews. Chart requires an
optional Chart.js dependency and is explicitly reference-only.
