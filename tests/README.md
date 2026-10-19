# Verification

Terrain dependency probes also run in unittest. They exercise pinned headless
Tesserae, seeded noise, PNG round-trips and patches with network access blocked.
See the [dependency kit](../docs/terrain-dependencies.md) for scope and optional
generated previews; these are not tests of a finished terrain command.

Standard-library checks, Python 3.11+:

```sh
python3 tools/validate.py
python3 -m unittest discover -s tests -v
```

These cover vendor hash integrity, actual seeded upstream generation, every Lucide shape,
source validation, decoded PNG pixels/CRC/transparency, atlas coordinates,
deterministic output, source-preserving revisions, stale bases, writer locks, CLI
failures, starter provenance, contrast calculations and generated core scaffolds.
They do not assess artistic quality or run a language model.

## Scenarios: one end-to-end test each

[SCENARIOS.md](../SCENARIOS.md) lists every command and preview as Given/When/Then scenarios. Each has one test
named after its title: `tests/test_scenarios.py` runs `tools/visual.py` in a scratch folder and compares the decoded
pixels with `tests/fixtures/scenario_pixels.json` (record again only for an intended art change:
`VISUAL_CORE_RECORD_PIXELS=1 python3 -m unittest tests.test_scenarios`); `tests/browser.cjs` opens the previews.
The vendored [test-core tools](../tools/test-core/README.md) check that every scenario has its test (and that it
ran and passed), that every starter control is used by a browser step, and that no test waits on time:

```sh
python3 tests/junit_run.py .test-output/unittest-junit.xml
python3 tools/test-core/flaky_lint.py tests tests/browser.cjs tests/terrain-dependencies.cjs
python3 tools/test-core/e2e_coverage.py --pages templates/web-app/index.html templates/component-kit/index.html --tests tests/browser.cjs
python3 tools/test-core/scenarios.py check SCENARIOS.md --tests tests/test_scenarios.py tests/browser.cjs \
  --junit .test-output/unittest-junit.xml .test-output/browser-junit.xml
```

Every Chromium launch passes `--use-mock-keychain --password-store=basic` (without them headless Chromium on macOS
asks for a keychain). `SCENARIO='<title>' node tests/browser.cjs` runs one browser scenario.

## Optional browser checks

No browser package is needed to generate or consume assets. For development checks,
install the lockfile-pinned optional test dependency and matching Chromium:

```sh
npm ci --prefix tests/browser --ignore-scripts
tests/browser/node_modules/.bin/playwright install chromium
NODE_PATH="$PWD/tests/browser/node_modules" node tests/browser.cjs
```

Alternatively provide an existing `playwright-core` on NODE_PATH and a Chromium
executable in `CHROME`. Python must be on PATH. The runner uses a temporary server
on localhost, creates real records through controls, checks persistence, filters,
keyboard/modal behavior, text escaping, narrow/zoomed layouts, reduced-motion settings and Basecoat tab/dialog behavior.
External requests are blocked and asserted absent; no CDN or font service is used. Screenshots go to `.test-output/browser/` for a separate human/agent
visual review. An automated screenshot capture is not proof of visual judgment.

The manual weak-model cases in [evals](../evals/README.md) remain not-run until a
model session and its evidence are recorded.

GitHub runs contracts and the same browser suite, retaining screenshots as build
artifacts. Dependency/browser installation needs network only for development/CI,
not for the bundled tools or generated projects.

Production terrain tests cover all three presets, all sizes, binary alpha, palette
limits, final seams, meaningful interior variants, unused cells, preserved history,
no-ops, stale bases, locks and failure recovery. Browser tests reconstruct the
terrain specimen from atlas/manifest and compare exact pixels; open all 41 catalog
pages with no external requests and exercise front-end Toast creation.
