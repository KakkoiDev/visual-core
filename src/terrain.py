"""Strict terrain recipes and a pinned headless JavaScript renderer."""
import base64
import copy
import hashlib
import html
import json
from pathlib import Path
import shutil
import subprocess

import visual_core as vc

PALETTES = {
    'meadow-warm': ['#3b6638', '#659547', '#a1bd60', '#624332', '#926746', '#be955f'],
    'coast-sunny': ['#ba873e', '#ddb868', '#f4dc92', '#265778', '#387f9a', '#64b7bf'],
    'dungeon-cool': ['#343541', '#626773', '#969eaa', '#161923', '#252a38', '#3e4657'],
}
PRESETS = {'meadow': 'meadow-warm', 'coast': 'coast-sunny', 'dungeon': 'dungeon-cool'}


def load(path):
    if Path(path).stat().st_size > 256_000:
        raise ValueError('Recipe limit is 256 KB')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f'Duplicate key: {key}')
            result[key] = value
        return result
    return json.loads(Path(path).read_text(), object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f'Invalid number: {value}')))


def validate(spec):
    vc.fields(spec, ['schema', 'kind', 'id', 'preset', 'seed', 'tile_size', 'topology', 'palette', 'detail', 'contour', 'variants'])
    if spec.get('schema') != 'visual-core.terrain/1' or spec.get('kind', 'terrain') != 'terrain':
        raise ValueError('schema must be visual-core.terrain/1; kind must be terrain')
    vc.ident(spec.get('id'))
    if spec.get('preset') not in PRESETS:
        raise ValueError('preset must be meadow, coast or dungeon')
    result = dict(schema='visual-core.terrain/1', kind='terrain', seed=42, tile_size=16,
                  topology='blob47', palette=PRESETS[spec['preset']], detail='medium',
                  contour={'profile': 'soft', 'border_px': 1}, variants=2)
    result.update(copy.deepcopy(spec))
    vc.integer(result['seed'], 0, 2**32-1, 'seed')
    vc.integer(result['tile_size'], 16, 64, 'tile_size')
    if result['tile_size'] not in (16, 32, 64):
        raise ValueError('tile_size must be 16, 32 or 64')
    if result['topology'] != 'blob47':
        raise ValueError('Only blob47 is supported in terrain/1')
    if result['palette'] not in PALETTES:
        raise ValueError('palette must be ' + ', '.join(PALETTES))
    if result['detail'] not in ('low', 'medium', 'high'):
        raise ValueError('detail must be low, medium or high')
    vc.integer(result['variants'], 1, 4, 'variants')
    vc.fields(result['contour'], ['profile', 'border_px'])
    if result['contour'].get('profile') not in ('soft', 'square'):
        raise ValueError('contour.profile must be soft or square')
    vc.integer(result['contour'].get('border_px'), 1, result['tile_size']//4, 'border_px')
    return result


def template(preset):
    return validate({'schema': 'visual-core.terrain/1', 'id': preset, 'preset': preset})


def patch(spec, change):
    vc.fields(change, ['set'])
    updates = change.get('set', {})
    vc.fields(updates, ['palette', 'detail', 'contour', 'variants'])
    result = copy.deepcopy(spec)
    result.update(copy.deepcopy(updates))
    return validate(result)


def render(spec, folder, previous=None):
    spec = validate(spec)
    sources = vc.load(vc.ROOT/'vendor/LOCK.json')['sources']
    upstreams = {s['id']: {'version': s['version'], 'revision': s.get('revision')}
                 for s in sources if s['id'] in ('tesserae', 'simplex-noise', 'alea')}
    adapter_hash = hashlib.sha256((vc.ROOT/'tools/terrain-render.mjs').read_bytes()).hexdigest()
    if previous and (previous.get('upstreams') != upstreams or previous.get('adapter_sha256') != adapter_hash):
        raise ValueError('Terrain toolchain changed; use the pinned original core or create a new named set')
    palette = previous['palette'] if previous and previous['palette_name'] == spec['palette'] else PALETTES[spec['palette']]
    try:
        process = subprocess.run(['node', str(vc.ROOT/'tools/terrain-render.mjs')],
                                 input=json.dumps({'spec': spec, 'palette': palette}), text=True,
                                 capture_output=True, timeout=30)
    except subprocess.TimeoutExpired as error:
        raise ValueError('Terrain render exceeded 30 seconds') from error
    if process.returncode:
        raise ValueError(process.stderr.strip() or 'Terrain renderer failed')
    data = json.loads(process.stdout)
    if not data['quality']['passed']:
        raise ValueError('Terrain quality gate failed')
    pixel_hashes = {}
    allowed = {bytes.fromhex(c[1:])+b'\xff' for c in palette} | {b'\0\0\0\0'}
    for name, image in data['outputs'].items():
        if name not in ('atlas', 'base', 'preview-native'):
            raise ValueError('Unexpected render output')
        rgba = base64.b64decode(image['rgba'], validate=True)
        if len(rgba) != image['width']*image['height']*4 or any(rgba[i:i+4] not in allowed for i in range(0, len(rgba), 4)):
            raise ValueError('Invalid palette, alpha or pixel buffer')
        (folder/f'{name}.png').write_bytes(vc.png(image['width'], image['height'], rgba))
        pixel_hashes[name] = hashlib.sha256(rgba).hexdigest()
    vc.write_json(folder/'spec.json', spec)
    vc.write_json(folder/'recipe.json', spec)
    vc.write_json(folder/'resolved.json', {'adapter_version': 1, 'palette': palette, 'engine_recipe': data['recipe']})
    vc.write_json(folder/'generator.json', {'adapter_version': 1, 'adapter_sha256': adapter_hash,
        'palette_name': spec['palette'], 'palette': palette, 'upstreams': upstreams})
    vc.write_json(folder/'quality.json', data['quality'])
    vc.write_json(folder/'specimen.json', {'width':24,'height':16,'cells':data['cells']})
    manifest = {'schema': 'visual-core.terrain-manifest/1', 'version': vc.VERSION, 'source': 'recipe.json',
        'topology': 'blob47', 'tile_size': spec['tile_size'], 'atlas': 'atlas.png', 'base': 'base.png',
        'atlas_width': 12*spec['tile_size'], 'atlas_height': 4*spec['tile_size']*spec['variants'],
        'bit_order': data['bitOrder'], 'tiles': data['tiles'], 'variant_weights': [1]*spec['variants'],
        'pixel_sha256': pixel_hashes, 'padding': 0, 'filter': 'nearest', 'mipmaps': False,
        'unused_cell': {'column':10,'row_in_each_variant':1}, 'visual_review':'not-performed'}
    vc.write_json(folder/'manifest.json', manifest)
    for source, license_name in [('tesserae','LICENSE'),('alea','LICENSE'),('simplex-noise','LICENSE')]:
        path = vc.ROOT/'vendor'/source/license_name
        if not path.exists():
            path = next((vc.ROOT/'vendor'/source).glob('LICENSE*'))
        shutil.copyfile(path, folder/f'LICENSE-{source}.txt')
    (folder/'preview.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Terrain preview</title><style>body{font:16px system-ui;background:#eee;padding:20px}img{image-rendering:pixelated;max-width:100%}</style><h1>'+html.escape(spec['id'])+'</h1><p>Native scale specimen</p><img src="preview-native.png" alt="Terrain specimen"><p>Atlas; rows grouped by variant</p><img src="atlas.png" alt="Terrain atlas"><p>Use manifest.json for stable mask IDs and rectangles. Nearest filtering; no mipmaps.</p></html>')
    return data['quality']


def main(argv):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest='action', required=True)
    actions.add_parser('catalog')
    p = actions.add_parser('template'); p.add_argument('preset', choices=PRESETS)
    p = actions.add_parser('check'); p.add_argument('recipe')
    p = actions.add_parser('create'); p.add_argument('recipe'); p.add_argument('--out', required=True)
    p = actions.add_parser('read'); p.add_argument('asset')
    p = actions.add_parser('revise'); p.add_argument('asset'); p.add_argument('--base',type=int,required=True); p.add_argument('--patch',required=True)
    args = parser.parse_args(argv)
    try:
        if args.action == 'catalog':
            result = {'schema':'visual-core.terrain/1','presets':list(PRESETS),'palettes':list(PALETTES),'tile_sizes':[16,32,64], 'variants':[1,2,3,4], 'detail':['low','medium','high'], 'topology':['blob47']}
        elif args.action == 'template': result = template(args.preset)
        elif args.action == 'check': result = {'valid':True,'resolved':validate(load(args.recipe))}
        elif args.action == 'create': result = vc.publish(args.out,validate(load(args.recipe)))
        elif args.action == 'read': result = vc.read_asset(args.asset)
        else: result = vc.publish(args.asset,base=args.base,patch=load(args.patch))
        print(json.dumps(result,indent=2)); return 0
    except (ValueError,OSError,KeyError,TypeError,OverflowError) as error:
        print(json.dumps({'error':str(error),'published':False})); return 1
