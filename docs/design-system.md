# Opinionated visual defaults

Preserve the host's established style. For a new project, use the shipped warm
paper palette: background #f6f3eb, surface #ffffff, ink #172f36, muted #50626a,
accent #12675f, white on accent. Native system font; no external font request.
Spacing uses 8 px steps, surfaces use 12 px radii, icons use a 24 px grid with a
2 px outline, pixel assets start at 16×16 with transparent backgrounds.

## Interface composition

Start with a clear page title, one sentence of useful context, one primary action
and a short content hierarchy. Use realistic content supplied by the user. Do not
invent metrics or fill every gap with decorative cards. Set the text measure and
spacing before adding artwork. Use one accent color and restrained borders.
A strong illustration is a focal point, not repeated background noise.

Use native buttons, links, labels, inputs and dialog before custom widgets. Give
controls visible labels and at least 44 px target dimensions as a core default.
Do not use color alone for success/error states. Provide empty, error, loading
and completed states where the app's real data flow needs them. The local-only
starter has no network-loading state; do not fake one to look complete.

Preserve visible focus, logical keyboard order, cancel/escape paths, and reduced
motion. Test at 360×800 and 1280×900, then 200% zoom. Normal text targets contrast
4.5:1; large text and essential graphical controls target 3:1. These are checks,
not a claim of full accessibility conformance. The helper accepts hex colors:

```sh
python3 tools/visual.py contrast '#50626a' '#f6f3eb'
```

Basecoat owns components. The core CSS has scoped vc- layout classes and semantic
Basecoat theme tokens; copy tested component markup instead of inventing widgets. In an existing framework,
adapt the recipe and tokens to its components rather than importing global resets
or replacing its component library. Theme tokens use Basecoat semantics (--background, --primary, --foreground, etc.).

## Asset composition

Keep a shared palette, silhouette, light direction, stroke or pixel density and
scale across a set. A pixel sprite should read at native resolution. Start with
three values (outline, body, highlight) and add color only to improve readability.
Keep animation pivots and canvas size stable; use small deliberate motion. Tiles
must be evaluated in repeated neighborhoods, not just as isolated swatches.

Official reference: [WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/).
For motion, see [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
