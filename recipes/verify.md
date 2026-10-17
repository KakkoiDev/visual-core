# Verify the actual result

A successful generator exit means structurally valid files. It does not prove a
beautiful, accessible or working interface. Keep these layers separate:

1. **Structure:** run check/create; inspect dimensions, frame IDs, atlas coordinates,
   no all-transparent output, expected palette, source hashes and output paths.
   The supplied manifest always says visual_review=not-performed.
2. **Behavior:** serve the actual app and run its primary flow. Check console errors,
   create/edit actions, empty states, persistence/reload where relevant, keyboard
   focus, cancel/Escape, mobile overflow and reduced motion. Do not inspect only a
   static HTML string. The browser smoke tests cover the shipped starter, not your
   consumer app.
3. **Appearance:** inspect actual screenshots at 360×800 and 1280×900. Check readable
   hierarchy, line length, spacing, control alignment, focus visibility, contrast
   against actual backgrounds and asset style consistency. At 200% zoom, check the
   primary workflow still works. For pixel assets inspect native and enlarged views;
   for tiles inspect repetition; for motion run a complete loop.
4. **Report evidence:** record viewport, tested interactions, screenshot paths and
   remaining limitations in the host's task/review notes. A human can still disagree
   with the aesthetic result. Never label automated checks as full accessibility
   conformance or model-quality certification.

If a browser or image viewer is unavailable, finish structural checks and report
visual verification as unavailable. Do not invent a screenshot or claim inspection.
A screenshot from another project or earlier revision is not evidence of this result.
Use the actual host preview tool or browser automation already available; this core
does not require another service or MCP server.
