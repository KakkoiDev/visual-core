# Web UI

**Outcome:** a coherent responsive interface with working primary actions.
**Inputs:** existing app, audience, task, real content, required states. Default:
warm-paper/teal, native controls, system font, 360 px and desktop layouts.

1. Read the host's instructions and inspect its current UI. List the primary user
   action and what must be preserved. For an existing UI, capture its current view.
2. Read [design defaults](../docs/design-system.md) and choose a [composition pattern](../docs/composition-patterns.md). Choose its existing design
   system or this default, not a second competing library. Sketch a short content
   hierarchy in words: title → primary action → essential content → secondary tools.
3. For a new folder run `python3 tools/visual.py init web-app --out ../my-app` from
   the core checkout. For an existing folder adapt components in place. Never run
   init over the app. The starter's behavior is an example, not product requirements.
4. Implement the requested real actions and relevant empty/error states. Use
   native semantics, labels and visible focus. Preserve host routing/state ownership.
5. Serve with the host's dev command (or Python http.server for a static folder).
   Check actual controls, phone layout and desktop layout. Inspect the screenshot;
   fix hierarchy/spacing/readability before adding decorative effects.
6. Complete [verification](verify.md) and present a screenshot/live preview plus
   what changed. If the browser is unavailable, report the UI as not visually verified.

**Stop:** source exists but controls are placeholders, the page overflows on mobile,
a primary action is ambiguous, or a screenshot has not actually been inspected.
