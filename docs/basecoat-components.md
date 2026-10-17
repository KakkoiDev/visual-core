# Basecoat component catalog

All 41 component guides are local and pinned to Basecoat 1.0.2. Browse
[the offline HTML catalog](../examples/basecoat-catalog/index.html) or its
[machine-readable index](../examples/basecoat-catalog/catalog.json). Individual
pages include copyable HTML extracted from the upstream previews. Original MDX
and Jinja/Nunjucks macros remain unchanged under vendor/basecoat/.

Use the prebuilt local CSS and all.min.js; no Tailwind build or CDN is needed.
Copy IDs once per page; replace placeholder content with the host data. Preserve
labels, roles, aria relationships, keyboard behavior and focus handling. Buttons
and forms need real host actions. Check the exact guide for component runtime
requirements; keyboard behavior still needs testing in the final page.

Chart is reference-only until Chart.js is deliberately added and pinned. Toast
uses the local front-end API, not the upstream HTMX/server endpoint. Avatar
previews use an inline placeholder instead of downloading third-party pictures.
Sidebar is a minimal documented layout example. These adaptations are in generated
examples only; the upstream documentation and assets remain unchanged.

| Group | Component | Local guide | Nunjucks macro |
|---|---|---|---|
| Actions and navigation | [button](../examples/basecoat-catalog/components/button.html) | [guide](../vendor/basecoat/docs/components/button.mdx) | — |
| Actions and navigation | [button-group](../examples/basecoat-catalog/components/button-group.html) | [guide](../vendor/basecoat/docs/components/button-group.mdx) | — |
| Actions and navigation | [breadcrumb](../examples/basecoat-catalog/components/breadcrumb.html) | [guide](../vendor/basecoat/docs/components/breadcrumb.mdx) | — |
| Actions and navigation | [dropdown-menu](../examples/basecoat-catalog/components/dropdown-menu.html) | [guide](../vendor/basecoat/docs/components/dropdown-menu.mdx) | [macro](../vendor/basecoat/templates/nunjucks/dropdown-menu.njk) |
| Actions and navigation | [pagination](../examples/basecoat-catalog/components/pagination.html) | [guide](../vendor/basecoat/docs/components/pagination.mdx) | — |
| Actions and navigation | [sidebar](../examples/basecoat-catalog/components/sidebar.html) | [guide](../vendor/basecoat/docs/components/sidebar.mdx) | [macro](../vendor/basecoat/templates/nunjucks/sidebar.njk) |
| Actions and navigation | [tabs](../examples/basecoat-catalog/components/tabs.html) | [guide](../vendor/basecoat/docs/components/tabs.mdx) | [macro](../vendor/basecoat/templates/nunjucks/tabs.njk) |
| Forms and selection | [field](../examples/basecoat-catalog/components/field.html) | [guide](../vendor/basecoat/docs/components/field.mdx) | — |
| Forms and selection | [label](../examples/basecoat-catalog/components/label.html) | [guide](../vendor/basecoat/docs/components/label.mdx) | — |
| Forms and selection | [input](../examples/basecoat-catalog/components/input.html) | [guide](../vendor/basecoat/docs/components/input.mdx) | — |
| Forms and selection | [input-group](../examples/basecoat-catalog/components/input-group.html) | [guide](../vendor/basecoat/docs/components/input-group.mdx) | — |
| Forms and selection | [textarea](../examples/basecoat-catalog/components/textarea.html) | [guide](../vendor/basecoat/docs/components/textarea.mdx) | — |
| Forms and selection | [checkbox](../examples/basecoat-catalog/components/checkbox.html) | [guide](../vendor/basecoat/docs/components/checkbox.mdx) | — |
| Forms and selection | [radio-group](../examples/basecoat-catalog/components/radio-group.html) | [guide](../vendor/basecoat/docs/components/radio-group.mdx) | — |
| Forms and selection | [switch](../examples/basecoat-catalog/components/switch.html) | [guide](../vendor/basecoat/docs/components/switch.mdx) | — |
| Forms and selection | [slider](../examples/basecoat-catalog/components/slider.html) | [guide](../vendor/basecoat/docs/components/slider.mdx) | — |
| Forms and selection | [native-select](../examples/basecoat-catalog/components/native-select.html) | [guide](../vendor/basecoat/docs/components/native-select.mdx) | — |
| Forms and selection | [select](../examples/basecoat-catalog/components/select.html) | [guide](../vendor/basecoat/docs/components/select.mdx) | [macro](../vendor/basecoat/templates/nunjucks/select.njk) |
| Forms and selection | [combobox](../examples/basecoat-catalog/components/combobox.html) | [guide](../vendor/basecoat/docs/components/combobox.mdx) | [macro](../vendor/basecoat/templates/nunjucks/combobox.njk) |
| Forms and selection | [command](../examples/basecoat-catalog/components/command.html) | [guide](../vendor/basecoat/docs/components/command.mdx) | [macro](../vendor/basecoat/templates/nunjucks/command.njk) |
| Layout and content | [accordion](../examples/basecoat-catalog/components/accordion.html) | [guide](../vendor/basecoat/docs/components/accordion.mdx) | — |
| Layout and content | [card](../examples/basecoat-catalog/components/card.html) | [guide](../vendor/basecoat/docs/components/card.mdx) | — |
| Layout and content | [item](../examples/basecoat-catalog/components/item.html) | [guide](../vendor/basecoat/docs/components/item.mdx) | — |
| Layout and content | [empty](../examples/basecoat-catalog/components/empty.html) | [guide](../vendor/basecoat/docs/components/empty.mdx) | — |
| Layout and content | [table](../examples/basecoat-catalog/components/table.html) | [guide](../vendor/basecoat/docs/components/table.mdx) | — |
| Layout and content | [scroll-area](../examples/basecoat-catalog/components/scroll-area.html) | [guide](../vendor/basecoat/docs/components/scroll-area.mdx) | — |
| Feedback and overlays | [alert](../examples/basecoat-catalog/components/alert.html) | [guide](../vendor/basecoat/docs/components/alert.mdx) | — |
| Feedback and overlays | [alert-dialog](../examples/basecoat-catalog/components/alert-dialog.html) | [guide](../vendor/basecoat/docs/components/alert-dialog.mdx) | — |
| Feedback and overlays | [dialog](../examples/basecoat-catalog/components/dialog.html) | [guide](../vendor/basecoat/docs/components/dialog.mdx) | [macro](../vendor/basecoat/templates/nunjucks/dialog.njk) |
| Feedback and overlays | [drawer](../examples/basecoat-catalog/components/drawer.html) | [guide](../vendor/basecoat/docs/components/drawer.mdx) | — |
| Feedback and overlays | [popover](../examples/basecoat-catalog/components/popover.html) | [guide](../vendor/basecoat/docs/components/popover.mdx) | [macro](../vendor/basecoat/templates/nunjucks/popover.njk) |
| Feedback and overlays | [toast](../examples/basecoat-catalog/components/toast.html) | [guide](../vendor/basecoat/docs/components/toast.mdx) | [macro](../vendor/basecoat/templates/nunjucks/toast.njk) |
| Feedback and overlays | [tooltip](../examples/basecoat-catalog/components/tooltip.html) | [guide](../vendor/basecoat/docs/components/tooltip.mdx) | — |
| Feedback and overlays | [progress](../examples/basecoat-catalog/components/progress.html) | [guide](../vendor/basecoat/docs/components/progress.mdx) | — |
| Feedback and overlays | [skeleton](../examples/basecoat-catalog/components/skeleton.html) | [guide](../vendor/basecoat/docs/components/skeleton.mdx) | — |
| Feedback and overlays | [spinner](../examples/basecoat-catalog/components/spinner.html) | [guide](../vendor/basecoat/docs/components/spinner.mdx) | — |
| Identity and display | [avatar](../examples/basecoat-catalog/components/avatar.html) | [guide](../vendor/basecoat/docs/components/avatar.mdx) | — |
| Identity and display | [badge](../examples/basecoat-catalog/components/badge.html) | [guide](../vendor/basecoat/docs/components/badge.mdx) | — |
| Identity and display | [kbd](../examples/basecoat-catalog/components/kbd.html) | [guide](../vendor/basecoat/docs/components/kbd.mdx) | — |
| Identity and display | [theme-switcher](../examples/basecoat-catalog/components/theme-switcher.html) | [guide](../vendor/basecoat/docs/components/theme-switcher.mdx) | — |
| Identity and display | [chart](../examples/basecoat-catalog/components/chart.html) | [guide](../vendor/basecoat/docs/components/chart.mdx) | — |

Regenerate with `python3 tools/build_basecoat_catalog.py`. Then run the browser
checks. Extracted preview coverage does not mean every state is exhaustively
tested; see tests/README.md for the actual checks.
