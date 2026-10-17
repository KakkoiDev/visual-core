"""Verify locked, checked-in upstream files without network access."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check(root=ROOT/'vendor'):
    lock = json.loads((root/'LOCK.json').read_text())
    if lock.get('schema_version') != 1:
        raise ValueError('Unsupported vendor lock schema')
    seen = set()
    for source in lock['sources']:
        name = source['id']
        if name in seen or '/' in name or name in ('.', '..'):
            raise ValueError('Invalid or duplicate vendor ID')
        seen.add(name)
        directory = root/name
        actual = {str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()}
        if actual != set(source['sha256']):
            raise ValueError(f'{name}: missing or unrecorded files')
        for relative, expected in source['sha256'].items():
            path = directory/relative
            if path.is_symlink() or '..' in Path(relative).parts or Path(relative).is_absolute():
                raise ValueError(f'{name}: invalid vendor path')
            if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise ValueError(f'{name}/{relative}: hash mismatch; restore the pinned file')
    extra = {p.name for p in root.iterdir()} - seen - {'LOCK.json'}
    if extra:
        raise ValueError(f'Unrecorded vendor entries: {sorted(extra)}')
    return {source['id']:source['version'] for source in lock['sources']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['check'], nargs='?', default='check')
    parser.parse_args()
    try:
        print(json.dumps({'verified':check(), 'network_required':False}, indent=2))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, str(error)+'\n')
