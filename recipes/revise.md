# Targeted revisions

**Outcome:** the requested change, with unaffected parts and earlier outputs intact.

```sh
python3 tools/visual.py read assets/visual/robot
```

Use its returned revision as base. Write a small patch file, for example:

```json
{"set":{"palette":{"0":"#172F36","1":"#60B6A1","2":"#D9F0D2","3":"#F6BF62","4":"#FFFFFF"}}}
```

`set.palette` replaces the whole palette, so copy unchanged entries from the current
spec. For an icon, set color, shape, size or stroke. For pixel frames use
`{"frames":[{"id":"bounce","ms":200}]}` or patch only that frame's complete rows.
Unmentioned frames and fields are preserved. Dimensions, kind, name and frame
count cannot be patched; create a new asset for topology changes.

```sh
python3 tools/visual.py revise assets/visual/robot --base 1 --patch patch.json
```

A stale base or invalid patch returns a nonzero exit and keeps the last successful
pointer and files. Read again before retrying; fix the reported error, at most twice.
Outputs are 0002/, etc. Never edit a numbered source file in place to fake a revision.

UI follow-ups use the host's file-edit/git workflow, not this pixel patch format.
Preserve component IDs, content, actions and theme while making the requested edit.
Inspect a before/after preview and verify the specific change plus preserved behavior.
