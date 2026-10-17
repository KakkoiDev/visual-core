# Roadmap

These are planned tasks, not implemented capabilities.

## visual-core: a locally available, version-locked toolbox

- [ ] Replace agent-invented UI foundations with bundled Basecoat UI components,
  styles and working examples.
- [ ] Evaluate and bundle established deterministic pixel-art generation tools,
  curated presets and tested recipes.
- [ ] Lock upstream releases/commits, retain licenses and provenance, and document
  an explicit upgrade process.
- [ ] Make tools, reference documentation and recipes available locally after
  setup, with exact commands and known-good complete examples.
- [ ] Test representative tasks with a weaker/local model; record actual outputs
  and failures before claiming that the workflow is reliable for that model.

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
