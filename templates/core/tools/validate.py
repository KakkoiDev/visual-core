from pathlib import Path
import json
import re
root = Path(__file__).resolve().parents[1]
for path in root.rglob('*.md'):
    for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', path.read_text()):
        if '://' not in target and not target.startswith('#'):
            assert (path.parent / target.split('#')[0]).exists(), (path, target)
for capability in json.loads((root/'CAPABILITIES.json').read_text())['capabilities']:
    assert capability['status'] in ['planned','recipe','implemented']
    assert (root/capability['recipe']).is_file()
    if capability['status'] == 'implemented':
        assert capability.get('command') and capability.get('outputs'), 'Implemented capability needs a real contract'
print('Structure passed; domain execution and agent behavior are not verified by this check.')
