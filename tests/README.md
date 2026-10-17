# Verification

Standard-library checks, Python 3.11+:

```sh
python3 tools/validate.py
python3 -m unittest discover -s tests -v
```

These cover source validation, decoded PNG pixels/CRC/transparency, atlas coordinates,
deterministic output, source-preserving revisions, stale bases, writer locks, CLI
failures, starter provenance, contrast calculations and generated core scaffolds.
They do not assess artistic quality or run a language model.

## Optional browser checks

No browser package is needed to generate or consume assets. For development checks,
install Playwright into the ignored output directory, with a matching Chromium:

```sh
npm install --prefix .test-output/browser-deps --no-save playwright@1.56.1
.test-output/browser-deps/node_modules/.bin/playwright install chromium
NODE_PATH="$PWD/.test-output/browser-deps/node_modules" node tests/browser.cjs
```

Alternatively provide an existing `playwright-core` on NODE_PATH and a Chromium
executable in `CHROME`. Python must be on PATH. The runner uses a temporary server
on localhost, creates real records through controls, checks persistence, filters,
keyboard/modal behavior, text escaping, narrow/zoomed layouts and reduced-motion
settings. Screenshots go to `.test-output/browser/` for a separate human/agent
visual review. An automated screenshot capture is not proof of visual judgment.

The manual weak-model cases in [evals](../evals/README.md) remain not-run until a
model session and its evidence are recorded.
