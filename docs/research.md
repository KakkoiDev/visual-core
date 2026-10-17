# Repository review and decisions

Inspected 2026-10-17. These are design references, not dependencies. No source code
or third-party artwork was copied into visual-core. The renderer, shapes and presets
here are original. Repository names and current state matter:

| Source and reviewed commit | Observed | Adopted here |
|---|---|---|
| [jp-core](https://github.com/KakkoiDev/jp-core/tree/e73891a134ca38731c686e7781a99ce6999fbb11), AGENTS.md, RECIPES.md, IMPLEMENTATIONS.toml | Canonical mechanics; ownership boundary; capability-based example registry | Scope document, stable IDs, registry with honest statuses |
| [jpanki](https://github.com/KakkoiDev/jpanki/tree/d956b04461c78aa9ea1b6f53f6447bd5aee71ed2), README.md | Compatibility facade now forwards to jp-core; do not duplicate implementation | One canonical source, thin consumers, migration discipline |
| [anki-voiced](https://github.com/KakkoiDev/anki-voiced/tree/541f23e8b0e28a7b8ef5655f9e088800a118194d), README.md | Named project pipeline, validate/build commands, structured sources | Short init/template/create/read/revise loop |
| [p2p-core](https://github.com/KakkoiDev/p2p-core/tree/a1ee8fb160b1f22d33437b2bd17a30485799be37), README.md, AGENTS.md, package.json | One useful API, no browser build step, optional extras, concrete diagnostics | Zero runtime dependencies, portable browser assets, explicit limits |
| [pi-local-harness](https://github.com/KakkoiDev/pi-local-harness/tree/6628b8e53367b284a25e84d999e8c63159648901), music guide/tool/score/renderer | Short injected guide, tested composition scaffold, editable source, bounded rendering, immutable revisions | Curated presets, stable frame patches, manifests and visible preview loop |
| [ai-handbook](https://github.com/KakkoiSchool/ai-handbook/tree/19f13d8907a2b12c2452cefa9c3e2d5ff633efaa), README.md, AGENTS.md, recipes/games.md, evals/README.md | One URL, intent router, tiny bootstrap, delegation to upstream, weak-agent evals | Small entry point, intent recipes, source-of-truth links and honest verification |
| [music-core](https://github.com/KakkoiDev/music-core) | Repository exists but had no commits when cloned | No standalone implementation could be inspected; music mechanics were reviewed in pi-local-harness instead |

The user clarified that jpanki was the intended Anki reference; no separate anki-core
implementation is claimed. ai-guild was inspected only to identify the relevant
KakkoiSchool repository; ai-handbook is the authoritative task guide.

## Deliberate first-version choices

The first runnable set is native web UI, curated SVG icons and small pixel atlases.
These can be generated and edited reliably without installing an art application or
a large model. A constrained spec is easier to validate and revise than arbitrary
model-generated SVG/JavaScript. Fine illustrations, game UI and motion use recipes
and the host's tools; the capability index explicitly marks them as recipes.

Do not add Aseprite/Pillow/resvg or a generative service until a real consumer needs
an output the current path cannot produce. The shared standard is included as a
reusable skeleton, without changing any existing core or handbook repository.

External technical references: [SVG](https://developer.mozilla.org/en-US/docs/Web/SVG),
[WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/),
[reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
New Kakkoi browser-game engine work delegates to
[LittleJS-AI](https://github.com/KilledByAPixel/LittleJS-AI).
