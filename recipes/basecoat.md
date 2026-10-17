# Build with the bundled Basecoat UI

**Outcome:** a working interface assembled from proven components, using local files.
**Default:** Basecoat 1.0.2, Vega style, visual-core warm theme. No React, Tailwind
build, npm install or CDN needed to use the prebuilt assets.

## Run first

From this checkout, create a fresh project or a component reference:

```sh
python3 tools/visual.py init web-app --out ../my-app
python3 tools/visual.py init component-kit --out ../component-reference
python3 -m http.server 8080 --directory ../component-reference
```

Open localhost:8080 and use the form, keyboard tabs and dialog. Their editable HTML
is in templates/component-kit/index.html; the real app example is templates/web-app/.
Do not invent component classes or recreate Basecoat's interaction handlers.

## Choose the smallest existing component

| Need | Markup/reference to read locally |
|---|---|
| Button / input / field / textarea | vendor/basecoat/docs/components/button.mdx, input.mdx, field.mdx, textarea.mdx |
| Form example | templates/component-kit/index.html, templates/component-kit/kit.js |
| Card / badge / alert / empty state | vendor/basecoat/docs/components/card.mdx, badge.mdx, alert.mdx, empty.mdx |
| Dialog | templates/component-kit/index.html; vendor/basecoat/docs/components/dialog.mdx |
| Tabs | templates/component-kit/index.html; vendor/basecoat/docs/components/tabs.mdx |
| Menu / select / combobox | vendor/basecoat/docs/components/dropdown-menu.mdx, select.mdx, combobox.mdx |
| Table / sidebar / pagination | vendor/basecoat/docs/components/table.mdx, sidebar.mdx, pagination.mdx |
| All documented components | vendor/basecoat/docs/components/ |

Read only the file for the needed component. The upstream docs are unmodified MDX:
read the HTML and Usage sections as source; no MDX renderer is required. Some
upstream links point to their website; use the bundled files instead. Chart is an
optional upstream helper with extra dependencies, not a bundled ready-to-run chart
solution. Use native tables until a real chart dependency is explicitly added.

## Copy and adapt

1. Preserve the host's framework, build and design system. For a fresh static app,
   init copies the prebuilt CSS, all.js runtime and licenses into vendor/basecoat/.
   Its HTML already loads local CSS, then ui/visual-core.css, then local JavaScript.
2. Copy complete component markup, including roles, labels, IDs and data attributes.
   Give each copied instance unique IDs and matching aria-controls/aria-labelledby.
   These are Basecoat **1.0** APIs: use .btn with data-variant, not older aliases
   such as .btn-primary from tutorials for another release.
3. Most controls are CSS-only. For JS components, keep the bundled all.min.js;
   call window.basecoat.initAll() after adding component DOM. Do not force-reset
   instances on every render; that can erase focus and transient selection.
4. Change text, actions and semantic theme tokens. ui/visual-core.css owns only
   layout/theme/accessibility defaults; Basecoat owns component structure/style.
   Do not edit vendor/basecoat or replace it with a latest/CDN URL.
5. Wire the app's real behavior. Native dialogs use showModal()/close(); buttons
   still need product actions. A copied template is not an account or backend.
6. Test the controls, keyboard, mobile and actual rendered screen. Follow
   [verification](verify.md); present the preview and source paths.

**Recovery:** if a component looks unstyled, confirm the local CSS loaded before
changing its markup. If tabs/menus do nothing, check local all.min.js and the exact
IDs/roles in this release's local example. After two failed fixes, show the concrete
error and preserve the working parts; do not install a replacement UI framework.

License/provenance and upgrades: [local toolbox](../docs/toolbox.md).

For the complete local component set, use [the 41-component catalog](../docs/basecoat-components.md).
Load one guide/snippet at a time. Preserve labels/IDs/roles and test actual host
behavior. Chart is reference-only; Toast previews use the front-end API.
