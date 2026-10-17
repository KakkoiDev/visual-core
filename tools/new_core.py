#!/usr/bin/env python3
"""Create a deliberately unimplemented core skeleton without overwriting a folder."""
import argparse
from pathlib import Path
import re
import shutil
import tempfile


def generate(name, out):
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,34}-core', name):
        raise ValueError('Use a lowercase hyphenated name ending in -core')
    out = Path(out)
    if out.exists():
        raise ValueError('Output exists; refusing to overwrite it')
    source = Path(__file__).resolve().parents[1] / 'templates/core'
    out.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.core-', dir=out.parent))
    try:
        for path in source.rglob('*'):
            if path.is_file():
                dest = stage / path.relative_to(source)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(path.read_text().replace('{{CORE_NAME}}', name))
        if out.exists():
            raise ValueError('Output was created concurrently')
        stage.rename(out)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return out


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name'); parser.add_argument('--out', required=True)
    args = parser.parse_args()
    try:
        print(generate(args.name, args.out))
    except (ValueError, OSError) as error:
        parser.exit(1, str(error)+'\n')
