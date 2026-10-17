#!/usr/bin/env python3
"""Single local entry point; refuse drift in bundled upstream tools."""
from pathlib import Path
import json
import sys
from vendor import check

try:
    check()
except (OSError, ValueError, KeyError) as error:
    print(json.dumps({'error':str(error), 'published':False}))
    raise SystemExit(1)

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from visual_core import main
raise SystemExit(main())
