# Third-party notices

Upstream files are vendored unchanged; exact pins and hashes are in vendor/LOCK.json.

- Basecoat UI 1.0.2: copyright Ronan Berder, MIT. Original terms:
  [LICENSE.md](vendor/basecoat/LICENSE.md). The published package and local docs
  retain their source attribution. Source: https://github.com/hunvreus/basecoat.
- Pixel Sprite Generator 0.0.2: copyright Zelimir Fedoran, MIT. Original terms:
  [LICENSE](vendor/pixel-sprite-generator/LICENSE). The three mask presets are
  extracted from its example/index.html. Source: https://github.com/zfedoran/pixel-sprite-generator.
- Lucide static 1.59.0: ISC for Lucide, with inherited Feather material under MIT;
  complete original terms: [LICENSE](vendor/lucide/LICENSE).
  Source: https://github.com/lucide-icons/lucide.
- Tailwind CSS 4.3.1 is compiled into Basecoat's prebuilt stylesheet. MIT terms:
  [LICENSE](vendor/tailwindcss/LICENSE). Source: https://github.com/tailwindlabs/tailwindcss.
- Bebas Neue (Regular): copyright 2010 Dharma Type, SIL Open Font License 1.1. Original terms:
  [OFL-bebasneue.txt](themes/kakkoi/fonts/OFL-bebasneue.txt). Bundled unchanged in the Kakkoi theme as
  `themes/kakkoi/fonts/BebasNeue-Regular.ttf` (sha256 08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73).
  Source: https://github.com/dharmatype/Bebas-Neue.
- Inter 4.001 (variable, opsz and wght): copyright 2016 The Inter Project Authors, SIL Open Font License 1.1. Original
  terms: [OFL-inter.txt](themes/kakkoi/fonts/OFL-inter.txt). Bundled unchanged as `themes/kakkoi/fonts/Inter[opsz,wght].ttf`
  (sha256 29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031), from google/fonts `ofl/inter` at commit
  0b58fb370093f9a9f4ff785d94405710b79de67c. Source: https://github.com/rsms/inter.
- Noto Sans JP 2.004 (variable, wght): copyright 2014-2021 Adobe, with Reserved Font Name 'Source', SIL Open Font
  License 1.1. Original terms: [OFL-notosansjp.txt](themes/kakkoi/fonts/OFL-notosansjp.txt). Bundled unchanged as
  `themes/kakkoi/fonts/NotoSansJP[wght].ttf` (sha256 c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f),
  from google/fonts `ofl/notosansjp` at commit 66a36c8c94b1a5d992ee4e7f392fccfe4945767c.
- test-core tools (scenarios.py, e2e_coverage.py, flaky_lint.py) at commit 9906fb6b1c5a2bce138d6293b70afb60fe91fb1f:
  copyright KakkoiDev, MIT. Terms: [LICENSE](tools/test-core/LICENSE). Development checks only, not redistributed
  in generated outputs. Source: https://github.com/KakkoiDev/test-core.

visual-core's original adapter, recipes, templates and renderer use the root MIT
license. Third-party notices remain applicable to redistributed source/assets;
keep the accompanying license files when copying generated outputs into a project.
