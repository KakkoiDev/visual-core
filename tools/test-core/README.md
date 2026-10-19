# Vendored test-core tools

Copied unchanged from [test-core](https://github.com/KakkoiDev/test-core) at commit
`9906fb6b1c5a2bce138d6293b70afb60fe91fb1f` (branch `feat/recipes`), MIT licence (`LICENSE` here). Standard library
only; nothing is installed or downloaded.

| Tool | What it checks here |
|---|---|
| `scenarios.py` | Every scenario in `SCENARIOS.md` has an end-to-end test named after its title, and (with `--junit`) it ran and passed |
| `e2e_coverage.py` | Every control of the web-app and component-kit starters is used by a step in `tests/browser.cjs`; no step uses a control that is gone |
| `flaky_lint.py` | No fixed sleeps, timers used as waits, `.only`, `networkidle` or real hosts in the tests |

```sh
python3 tests/junit_run.py .test-output/unittest-junit.xml
NODE_PATH="$PWD/tests/browser/node_modules" node tests/browser.cjs      # writes .test-output/browser-junit.xml
python3 tools/test-core/scenarios.py check SCENARIOS.md --tests tests/test_scenarios.py tests/browser.cjs \
  --junit .test-output/unittest-junit.xml .test-output/browser-junit.xml
python3 tools/test-core/e2e_coverage.py --pages templates/web-app/index.html templates/component-kit/index.html \
  --tests tests/browser.cjs
python3 tools/test-core/flaky_lint.py tests tests/browser.cjs tests/terrain-dependencies.cjs
```

To update: copy `tools/scenarios.py`, `tools/e2e_coverage.py` and `tools/flaky_lint.py` from a newer test-core
commit unchanged and change the commit above.
