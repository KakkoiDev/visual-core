# Verification

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
