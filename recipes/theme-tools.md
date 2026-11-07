# Theme tools

Two commands turn a theme's sources into what apps load. Both are deterministic and use the standard library only.

```sh
python3 tools/visual.py icons themes/kakkoi/svg/kakkoi-icon-maskable.svg --out themes/kakkoi/png   # 16, 32, 180, 192, 512
python3 tools/visual.py icons MARK.svg --out DIR --sizes 48,96
python3 tools/visual.py theme-openui themes/kakkoi/kakkoi-tokens.json --out themes/kakkoi/kakkoi.openui.json
```

- **icons** draws a plain SVG (rect and path with fill, stroke, stroke-width and caps) into square PNGs named
  `<svg name>-<size>.png`, for favicons (16, 32), the Apple touch icon (180) and web app manifests (192, 512; use the
  maskable SVG for `"purpose": "maskable"`). It refuses text, images and other elements by name: outline a mark
  first. Square caps also fill right-angled corners, so outlines with square caps keep their corners.
- **theme-openui** maps Basecoat-style tokens (light and dark) onto OpenUI's ThemeProvider overrides, for
  `<AgentInterface theme={{ mode, lightTheme, darkTheme }}>`. Surfaces, text, borders, accents, the user's chat bubble
  and every chart palette come from the tokens. Every radius follows `--radius`. Headings use the sans face, because in
  a chat they are model output.

The Kakkoi theme commits both outputs (`themes/kakkoi/png/`, `themes/kakkoi/kakkoi.openui.json`). Its scenario checks
that they match a fresh export, so regenerate them whenever a token or mark changes.
