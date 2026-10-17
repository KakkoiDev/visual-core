# Roadmap

These are planned tasks, not implemented capabilities.

## visual-core: a locally available, version-locked toolbox

- [x] Bundle Basecoat UI 1.0.2 with prebuilt styles/runtime, upstream docs and working
  app/component examples; use it as the new UI foundation.
- [x] Bundle Pixel Sprite Generator 0.0.2 at an exact commit with a small seeded
  adapter, original masks, curated configs and editable PNG/SVG exports.
- [x] Bundle 50 Lucide 1.59.0 icons and retain the legacy icon names/old revisions.
- [x] Lock every vendored file, retain upstream licenses and archive/commit
  provenance, and document an explicit upgrade process.
- [x] Make normal commands, tools, examples and reference docs available locally
  with no runtime package download, CDN or frontend build.
- [x] Test repeatable upstream output, failure cases, preserved revisions and real
  Basecoat behavior with external browser requests blocked.
- [ ] Test representative tasks with a weaker/local model; record actual outputs
  and failures before claiming that the workflow is reliable for that model.
- [ ] Add further generators only for concrete unsupported tasks, with the same
  license/pin/offline/example/verification requirements.
- [x] Implement the first Blob 47 phase of the [terrain generator specification](docs/terrain-generator-spec.md):
  first prove a pinned headless Tesserae extraction, then ship curated material
  presets, Blob 47 atlases, seam checks, previews and preserved revisions.
  Use JavaScript/Node rendering and the existing Python packaging CLI for Pi;
  no required native renderer or image addon.
  Shipped presets, final-pixel checks, revisions and browser consumer. Broader
  design milestones (Dual Grid, engine exports, weak-model eval) remain planned.
- [x] Gather the [terrain dependency kit](docs/terrain-dependencies.md): six pinned
  upstream sources/licenses, prebuilt Tesserae JavaScript and offline headless
  render/noise/PNG/patch probes. Full production extraction acceptance is pending.

## Future repository: coding-core

- [ ] Create an opinionated, agent-first library of Python and JavaScript good
  practices, following the shared core structure.
- [ ] Teach pragmatic functional programming: pure functions, immutable data,
  composition, explicit inputs/outputs and side effects at clear boundaries.
- [ ] Supply many small, runnable recipes for common patterns: validation,
  transformations, configuration, file/JSON handling, CLI commands, error handling,
  async operations, resource cleanup and testing.
- [ ] Include ready-to-copy formatting, lint, type-check, test and build pipelines
  for both languages, including local commands and matching CI workflows.
- [ ] Pin tool versions and dependencies; provide lockfiles, setup instructions,
  local reference material and an explicit update process.
- [ ] Provide minimal project templates and complete examples with one documented
  command to run the appropriate checks.
- [ ] Add guidance for readable naming, small modules, dependency boundaries,
  predictable errors, logging, secrets handling and avoiding unnecessary dependencies.
- [ ] Pair recipes with meaningful tests and common failure examples; explain
  when a pattern fits and when a simpler approach is better.
- [ ] Give agents a short task router and a bounded check/fix loop that preserves
  behavior, keeps diffs focused and avoids unrelated refactoring.
- [ ] Evaluate recipes with weaker agents. Keep planned work distinct from tested,
  working capabilities and register real consumers only after verification.

Choose concrete tools and versions during implementation. This roadmap does not
create coding-core or add a runtime dependency from visual-core to it.

## Related core libraries

- coding-core now has its own repository; further recipe work belongs there.
- gaming-core now owns pinned LittleJS recipes/examples and starter tooling.
- Pi adoption is documented in its handoff; no live consumer is claimed yet.
