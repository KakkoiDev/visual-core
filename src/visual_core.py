"""Constrained, deterministic visual assets; Python standard library only."""
import argparse
import copy
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import tempfile
import zlib

VERSION = '0.1.0'
ROOT = Path(__file__).resolve().parents[1]
IDENT = re.compile(r'^[a-z][a-z0-9_-]{0,39}$')
COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
ICON_PATHS = {
    'check': '<path d="m5 12 4 4L19 6"/>',
    'close': '<path d="m6 6 12 12M6 18 18 6"/>',
    'arrow': '<path d="M4 12h16m-7-7 7 7-7 7"/>',
    'heart': '<path d="M12 20 4 12C-1 5 7 1 12 7c5-6 13-2 8 5Z"/>',
    'star': '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    'coin': '<circle cx="12" cy="12" r="9"/><path d="M12 7v10m-3-8h6m-6 6h6"/>',
    'robot': '<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M12 6V3M8 16h8M1 10v6m22-6v6"/><circle cx="8" cy="11" r="1"/><circle cx="16" cy="11" r="1"/>',
}


def load(path):
    if Path(path).stat().st_size > 256_000:
        raise ValueError('JSON limit is 256 KB')
    return json.loads(Path(path).read_text(encoding='utf8'))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf8')


def fields(value, allowed):
    if not isinstance(value, dict):
        raise ValueError('Expected an object')
    unknown = set(value) - set(allowed)
    if unknown:
        raise ValueError('Unknown fields: ' + ', '.join(sorted(unknown)))


def ident(value):
    if not isinstance(value, str) or not IDENT.fullmatch(value):
        raise ValueError('IDs use lowercase letters, digits, _ or -, starting with a letter (max 40)')


def integer(value, low, high, label):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'{label} must be an integer {low}–{high}')


def color(value):
    if not isinstance(value, str) or not COLOR.fullmatch(value):
        raise ValueError('Colors must be #RRGGBB')


def validate(spec):
    if not isinstance(spec, dict):
        raise ValueError('Expected a spec object')
    ident(spec.get('name'))
    if spec.get('kind') == 'icon':
        fields(spec, ['name', 'kind', 'shape', 'size', 'stroke', 'color'])
        if spec.get('shape') not in ICON_PATHS:
            raise ValueError('Choose a catalog icon shape')
        integer(spec.get('size'), 16, 128, 'size')
        if type(spec.get('stroke')) not in (int, float) or not math.isfinite(spec['stroke']) or not 1 <= spec['stroke'] <= 3:
            raise ValueError('stroke must be 1–3')
        color(spec.get('color'))
    elif spec.get('kind') == 'pixel':
        fields(spec, ['name', 'kind', 'width', 'height', 'palette', 'frames'])
        integer(spec.get('width'), 1, 64, 'width')
        integer(spec.get('height'), 1, 64, 'height')
        palette = spec.get('palette')
        if not isinstance(palette, dict) or not 1 <= len(palette) <= 16:
            raise ValueError('Use 1–16 palette entries')
        for key, value in palette.items():
            if not re.fullmatch('[0-9A-Z]', key):
                raise ValueError('Palette keys are one digit or uppercase letter; . is transparent')
            color(value)
        frames = spec.get('frames')
        if not isinstance(frames, list) or not 1 <= len(frames) <= 32:
            raise ValueError('Use 1–32 frames')
        seen, occupied = set(), 0
        for frame in frames:
            fields(frame, ['id', 'rows', 'ms'])
            ident(frame.get('id'))
            if frame['id'] in seen:
                raise ValueError('Frame IDs must be unique')
            seen.add(frame['id'])
            integer(frame.get('ms'), 40, 2000, 'frame ms')
            rows = frame.get('rows')
            if not isinstance(rows, list) or len(rows) != spec['height']:
                raise ValueError('Frame row count must equal height')
            for row in rows:
                if not isinstance(row, str) or len(row) != spec['width'] or set(row) - (set(palette) | {'.'}):
                    raise ValueError('Rows must match width and use palette keys or .')
                occupied += len(row) - row.count('.')
        if not occupied:
            raise ValueError('All frames are transparent')
    else:
        raise ValueError('kind must be icon or pixel')
    return spec


def png(width, height, rgba):
    """PNG RGBA8, no filters; standard-library deterministic encoder."""
    def chunk(kind, payload):
        return struct.pack('!I', len(payload)) + kind + payload + struct.pack('!I', zlib.crc32(kind + payload) & 0xffffffff)
    stride = width * 4
    scan = b''.join(b'\0' + rgba[y * stride:(y + 1) * stride] for y in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(scan, 9)) + chunk(b'IEND', b'')


def render(spec, folder):
    validate(spec)
    folder = Path(folder)
    write_json(folder / 'spec.json', spec)
    if spec['kind'] == 'icon':
        size, name = spec['size'], html.escape(spec['name'])
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 24 24" role="img" aria-labelledby="title"><title id="title">{name}</title><g fill="none" stroke="{spec["color"]}" stroke-width="{spec["stroke"]}" stroke-linecap="round" stroke-linejoin="round">{ICON_PATHS[spec["shape"]]}</g></svg>\n'
        (folder / 'asset.svg').write_text(svg)
        metrics = {'width': size, 'height': size, 'frames': 1}
        body = '<img src="asset.svg" alt="Icon preview" width="192" height="192">'
    else:
        w, h, frames = spec['width'], spec['height'], spec['frames']
        width = w * len(frames)
        rgba = bytearray(width * h * 4)
        rects, occupied, atlas = [], [], []
        for fi, frame in enumerate(frames):
            count = 0
            for y, row in enumerate(frame['rows']):
                for x, key in enumerate(row):
                    if key == '.':
                        continue
                    value = spec['palette'][key]
                    pos = (y * width + fi * w + x) * 4
                    rgba[pos:pos + 4] = bytes.fromhex(value[1:]) + b'\xff'
                    rects.append(f'<rect x="{fi*w+x}" y="{y}" width="1" height="1" fill="{value}"/>')
                    count += 1
            occupied.append(count)
            atlas.append({'id': frame['id'], 'x': fi*w, 'y': 0, 'width': w, 'height': h, 'ms': frame['ms'], 'pivot': {'x': w/2, 'y': h}})
        (folder / 'sheet.png').write_bytes(png(width, h, bytes(rgba)))
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{h}" viewBox="0 0 {width} {h}" shape-rendering="crispEdges"><title>{html.escape(spec["name"])}</title>{"".join(rects)}</svg>\n'
        (folder / 'sheet.svg').write_text(svg)
        write_json(folder / 'atlas.json', {'image': 'sheet.png', 'layout': 'horizontal', 'frames': atlas})
        metrics = {'width': width, 'height': h, 'frames': len(frames), 'occupied': occupied}
        body = f'<h2>Native scale</h2><img src="sheet.png" alt="All sprite frames at native scale" width="{width}" height="{h}"><h2>8× scale</h2><div style="overflow:auto"><img src="sheet.png" alt="All sprite frames enlarged eight times" width="{width*8}" height="{h*8}" style="image-rendering:pixelated;max-width:none"></div><p>Atlas coordinates and frame durations: <a href="atlas.json">atlas.json</a>. This is a static sheet, not an animation player.</p>'
    (folder / 'preview.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Asset preview</title><style>body{font:16px system-ui;background:#f6f3eb;color:#172f36;max-width:960px;margin:40px auto;padding:16px}img{background:repeating-conic-gradient(#d9dedb 0 25%,#fff 0 50%) 0/16px 16px}</style><h1>' + html.escape(spec['name']) + '</h1>' + body + '</html>')
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.iterdir()) if p.is_file()}
    write_json(folder / 'manifest.json', {'engine': 'visual-core', 'version': VERSION, 'metrics': metrics, 'sha256': hashes, 'visual_review': 'not-performed', 'source': 'spec.json'})
    return metrics


def safe_asset(folder):
    folder = Path(folder).absolute()
    if any(p.is_symlink() for p in [folder, *folder.parents]):
        raise ValueError('Asset paths must not contain symlinks')
    return folder


def read_asset(folder):
    folder = safe_asset(folder)
    if (folder / 'current.json').is_symlink():
        raise ValueError('Current pointer must not be a symlink')
    current = load(folder / 'current.json')
    fields(current, ['revision'])
    integer(current.get('revision'), 1, 9999, 'revision')
    rev = current['revision']
    directory = folder / f'{rev:04d}'
    if directory.is_symlink():
        raise ValueError('Revision must not be a symlink')
    if any((directory / name).is_symlink() for name in ('spec.json', 'manifest.json')):
        raise ValueError('Revision metadata must not be a symlink')
    return {'revision': rev, 'spec': validate(load(directory / 'spec.json')), 'manifest': load(directory / 'manifest.json'), 'directory': str(directory)}


def patch_spec(spec, patch):
    fields(patch, ['set', 'frames'])
    result = copy.deepcopy(spec)
    if 'set' in patch:
        fields(patch['set'], ['palette', 'shape', 'size', 'stroke', 'color'])
        result.update(patch['set'])
    if 'frames' in patch:
        if result['kind'] != 'pixel' or not isinstance(patch['frames'], list):
            raise ValueError('frames patch needs a pixel asset and an array')
        for frame in patch['frames']:
            fields(frame, ['id', 'rows', 'ms'])
            found = next((f for f in result['frames'] if f['id'] == frame.get('id')), None)
            if found is None:
                raise ValueError('Patch an existing frame ID; topology changes require a new asset')
            found.update(frame)
    return validate(result)


def publish(folder, spec=None, base=None, patch=None):
    folder = safe_asset(folder)
    creating = base is None
    if creating:
        if folder.exists():
            raise ValueError('Asset exists; read then revise instead')
        validate(spec)
        parent, rev = folder.parent, 1
    else:
        integer(base, 1, 9999, 'base revision')
        previous = read_asset(folder)
        if base != previous['revision']:
            raise ValueError(f'Stale base; read revision {previous["revision"]} first')
        spec, rev, parent = patch_spec(previous['spec'], patch), base + 1, folder
        integer(rev, 1, 9999, 'revision')
    parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.visual-', dir=parent))
    lock = None
    try:
        if not creating:
            lock = folder / '.revision-lock'
            try:
                fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                os.close(fd)
            except FileExistsError:
                lock = None
                raise ValueError('Another revision is running; retry after it finishes')
            if read_asset(folder)['revision'] != base:
                raise ValueError('Revision changed; read before retrying')
        destination = stage / f'{rev:04d}' if creating else stage
        destination.mkdir(exist_ok=True)
        metrics = render(spec, destination)
        if creating:
            write_json(stage / 'current.json', {'revision': rev})
            if folder.exists():
                raise ValueError('Asset was created concurrently; read it first')
            stage.rename(folder)
        else:
            stage.rename(folder / f'{rev:04d}')
            write_json(folder / 'current.next.json', {'revision': rev})
            (folder / 'current.next.json').replace(folder / 'current.json')
        return {'revision': rev, 'directory': str(folder / f'{rev:04d}'), 'metrics': metrics, 'visual_review': 'not-performed'}
    finally:
        if stage.exists():
            shutil.rmtree(stage)
        if lock and lock.exists():
            lock.unlink()


def contrast(a, b):
    def luminance(value):
        color(value)
        parts = [int(value[i:i+2], 16)/255 for i in (1, 3, 5)]
        linear = [n/12.92 if n <= 0.04045 else ((n+0.055)/1.055)**2.4 for n in parts]
        return sum(x*y for x, y in zip(linear, (0.2126, 0.7152, 0.0722)))
    x, y = sorted([luminance(a), luminance(b)])
    return (y+0.05)/(x+0.05)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('catalog')
    template = commands.add_parser('template'); template.add_argument('name', choices=['robot', 'terrain', 'icon'])
    create = commands.add_parser('create'); create.add_argument('spec'); create.add_argument('--out', required=True)
    read = commands.add_parser('read'); read.add_argument('asset')
    revise = commands.add_parser('revise'); revise.add_argument('asset'); revise.add_argument('--base', required=True, type=int); revise.add_argument('--patch', required=True)
    check = commands.add_parser('check'); check.add_argument('spec')
    init = commands.add_parser('init'); init.add_argument('recipe', choices=['web-app']); init.add_argument('--out', required=True)
    colors = commands.add_parser('contrast'); colors.add_argument('foreground'); colors.add_argument('background')
    args = parser.parse_args(argv)
    try:
        if args.command == 'catalog':
            result = {'version': VERSION, 'capabilities': load(ROOT/'CAPABILITIES.json'), 'icons': list(ICON_PATHS), 'templates': ['robot', 'terrain', 'icon'], 'ui': ['web-app']}
        elif args.command == 'template':
            result = load(ROOT/'presets'/f'{args.name}.json')
        elif args.command == 'create':
            result = publish(args.out, load(args.spec))
        elif args.command == 'read':
            result = read_asset(args.asset)
        elif args.command == 'revise':
            result = publish(args.asset, base=args.base, patch=load(args.patch))
        elif args.command == 'check':
            result = {'valid': bool(validate(load(args.spec))), 'visual_review': 'not-performed'}
        elif args.command == 'contrast':
            ratio = contrast(args.foreground, args.background)
            result = {'ratio': round(ratio, 3), 'normal_text_4_5': ratio >= 4.5, 'large_text_or_ui_3': ratio >= 3}
        else:
            target = Path(args.out)
            if target.exists():
                raise ValueError('Output exists; adapt its current UI instead of overwriting it')
            shutil.copytree(ROOT/'templates/web-app', target)
            (target/'vendor/visual-core').mkdir(parents=True)
            shutil.copyfile(ROOT/'ui/visual-core.css', target/'vendor/visual-core/visual-core.css')
            write_json(target/'vendor/visual-core/provenance.json', {'version': VERSION, 'css_sha256': hashlib.sha256((ROOT/'ui/visual-core.css').read_bytes()).hexdigest()})
            result = {'directory': str(target.absolute()), 'entry': 'index.html', 'next': 'Serve the folder, inspect desktop and mobile, test controls. See recipes/verify.md.'}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, KeyError, TypeError, OverflowError) as error:
        print(json.dumps({'error': str(error), 'published': False}))
        return 1
