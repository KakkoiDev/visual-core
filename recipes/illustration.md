# SVG illustration and backgrounds

**Outcome:** one coherent illustration supporting the page or game, not a random
ornament. This is a direct-editing recipe; no illustration generator is implemented.

1. State the focal object, purpose, composition and available space. Prefer a
   small original geometric illustration over a collection of unrelated assets.
2. Use the host palette and light direction. Start with 3–5 large shapes and
   negative space. Use a viewBox and grouped layers with stable IDs in the SVG.
3. Keep text in HTML where possible. Use original geometry or explicitly licensed
   assets with provenance. Do not introduce external links, scripts, foreignObject,
   embedded tracking or unreviewed SVG markup just to display an image.
4. Test at target size and on mobile. Check it supports the hierarchy and does not
   compete with the primary action. For game backgrounds, verify foreground
   contrast and the playable area with the actual character over it.
5. Preserve SVG groups for future edits; adjust the requested group instead of
   redrawing everything. Export with the host's existing renderer only when needed.

For painterly/high-detail artwork beyond the agent's tools, explain the limitation
and offer a simpler coherent vector result. Do not claim a nonexistent local model.
Reference: [SVG](https://developer.mozilla.org/en-US/docs/Web/SVG).
