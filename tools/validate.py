"""Validate discovery contracts, local documentation links and curated presets."""
from pathlib import Path
import json
import re
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from visual_core import validate, load
from vendor import check as check_vendor


def check():
    errors = []
    check_vendor()
    for path in ROOT.rglob('*.md'):
        if any(part.startswith('.') for part in path.relative_to(ROOT).parts) or 'vendor' in path.relative_to(ROOT).parts:
            continue
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', path.read_text()):
            if '://' not in target and not target.startswith('#'):
                if not (path.parent / target.split('#')[0]).exists():
                    errors.append(f'{path.relative_to(ROOT)}: missing {target}')
    catalog = load(ROOT / 'CAPABILITIES.json')
    assert catalog['schema_version'] == 1
    ids = set()
    for cap in catalog['capabilities']:
        assert cap['id'] not in ids, 'Duplicate capability'
        ids.add(cap['id'])
        assert cap['status'] in ('planned', 'recipe', 'implemented')
        assert (ROOT / cap['recipe']).is_file()
        if cap['status'] == 'implemented':
            assert cap.get('command') and cap.get('outputs'), cap['id']
        else:
            assert cap.get('command') is None, 'Do not advertise an unimplemented command'
    registry = tomllib.loads((ROOT / 'IMPLEMENTATIONS.toml').read_text())
    assert registry['schema_version'] == 1
    projects = set()
    for project in registry['projects']:
        assert project['id'] not in projects
        projects.add(project['id'])
        assert project['status'] in ('consumer', 'planned-consumer', 'candidate-consumer', 'migration-source', 'related-example', 'retired')
        assert project['url'].startswith('https://github.com/')
        assert project['description'] and project['capabilities'] and project['look_here']
        if project['status'] == 'consumer':
            assert project['integration_paths']
            for key in ('core_revision', 'verified_revision'):
                assert re.fullmatch('[0-9a-f]{40}', project[key]), key
    for preset in (ROOT / 'presets').glob('*.json'):
        validate(load(preset))
    assert len((ROOT / 'AGENTS.md').read_text()) < 8000, 'Keep the router small'
    if errors:
        raise ValueError('\n'.join(errors))
    print('Discovery, documentation links, registry and presets passed. Visual judgment and model behavior are separate checks.')


if __name__ == '__main__':
    check()
