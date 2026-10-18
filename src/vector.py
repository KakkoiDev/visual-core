"""Deterministic SVG from small recipes: icons, illustrations, logos, diagrams, decorations.

The model picks pieces, text, palette keys and layout; this module validates the
recipe, lays it out on a grid, writes clean SVG (no scripts, no external
references, text drawn as paths from a bundled stroke font) and renders a PNG
preview with its own rasteriser. Same recipe, same bytes.
"""
import copy
import hashlib
import html
import json
import math
from pathlib import Path
import re

import visual_core as vc
from pixel import Check, RecipeError, PALETTES, KEYS, resolve_key, merge, load

SCHEMA = 'visual-core.vector/1'
CONTENT = vc.ROOT/'content/vector'
KINDS = ('icon', 'illustration', 'logo', 'diagram', 'decoration', 'drawing')
PIECES = json.loads((CONTENT/'pieces.json').read_text(encoding='utf8'))
FONT = json.loads((CONTENT/'font.json').read_text(encoding='utf8'))
ICONS = PIECES['icons']
LIMIT = 1024
TOKEN = re.compile(r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
PATH_OK = re.compile(r'^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]*$')
ARGS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7, 'Z': 0}


# ---------------------------------------------------------------- path data

def parse_path(d):
    """Validate SVG path data and return absolute commands [(letter, [numbers])]."""
    if not isinstance(d, str) or not d.strip() or len(d) > 4000 or not PATH_OK.match(d):
        raise ValueError('path d may only use M L H V C S Q T A Z commands and numbers')
    tokens = TOKEN.findall(d)
    if ''.join(tokens).replace(' ', '') != re.sub(r'[\s,]', '', d):
        raise ValueError('path d has characters that are not commands or numbers')
    commands, i, letter = [], 0, None
    x = y = sx = sy = 0.0
    while i < len(tokens):
        if tokens[i].isalpha():
            letter = tokens[i]
            i += 1
        elif letter is None:
            raise ValueError('path d must start with M')
        upper, relative = letter.upper(), letter.islower()
        if not commands and upper != 'M':
            raise ValueError('path d must start with M')
        n = ARGS[upper]
        if upper == 'Z':
            commands.append(('Z', []))
            x, y = sx, sy
            letter = None if i >= len(tokens) or tokens[i].isalpha() else letter
            if letter is None:
                continue
            raise ValueError('numbers after Z need a new command')
        values = tokens[i:i + n]
        if len(values) < n or any(v.isalpha() for v in values):
            raise ValueError(f'path command {letter} needs {n} numbers')
        v = [float(t) for t in values]
        if not all(math.isfinite(a) and abs(a) <= 10000 for a in v):
            raise ValueError('path numbers must be finite and within ±10000')
        i += n
        if upper == 'H':
            v = [v[0] + (x if relative else 0), y]
            upper = 'L'
        elif upper == 'V':
            v = [x, v[0] + (y if relative else 0)]
            upper = 'L'
        elif upper == 'A':
            if relative:
                v[5] += x
                v[6] += y
        elif relative:
            v = [a + (x if j % 2 == 0 else y) for j, a in enumerate(v)]
        commands.append((upper, v))
        x, y = v[-2], v[-1]
        if upper == 'M':
            sx, sy = x, y
            letter = 'l' if relative else 'L'
    return commands


def arc_points(x1, y1, rx, ry, phi, large, sweep, x2, y2):
    """Endpoint arc to points (SVG implementation notes F.6)."""
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(x2, y2)]
    rx, ry = abs(rx), abs(ry)
    c, s = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    xp, yp = c * dx + s * dy, -s * dx + c * dy
    lam = xp * xp / (rx * rx) + yp * yp / (ry * ry)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    den = rx * rx * yp * yp + ry * ry * xp * xp
    coef = math.sqrt(max(0.0, num / den)) * (-1 if bool(large) == bool(sweep) else 1)
    cxp, cyp = coef * rx * yp / ry, -coef * ry * xp / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2

    def angle(ux, uy, vx, vy):
        a = math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a
    t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
    dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    steps = max(4, int(math.ceil(abs(dt) / (math.pi / 16))))
    points = []
    for k in range(1, steps + 1):
        t = t1 + dt * k / steps
        px, py = rx * math.cos(t), ry * math.sin(t)
        points.append((c * px - s * py + cx, s * px + c * py + cy))
    points[-1] = (x2, y2)
    return points


def flatten(commands):
    """Absolute commands → list of (points, closed) subpaths."""
    paths, current, closed = [], [], False
    x = y = 0.0
    last_control, last = None, None
    for letter, v in commands:
        if letter == 'M':
            if len(current) > 1:
                paths.append((current, closed))
            current, closed = [(v[0], v[1])], False
            x, y = v[0], v[1]
        elif letter == 'L':
            current.append((v[0], v[1]))
            x, y = v[0], v[1]
        elif letter in ('C', 'S'):
            if letter == 'S':
                c1 = (2 * x - last_control[0], 2 * y - last_control[1]) if last in ('C', 'S') else (x, y)
                c2, end = (v[0], v[1]), (v[2], v[3])
            else:
                c1, c2, end = (v[0], v[1]), (v[2], v[3]), (v[4], v[5])
            for k in range(1, 17):
                t = k / 16
                a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
                current.append((a * x + b * c1[0] + c * c2[0] + d * end[0], a * y + b * c1[1] + c * c2[1] + d * end[1]))
            last_control = c2
            x, y = end
        elif letter in ('Q', 'T'):
            if letter == 'T':
                c1 = (2 * x - last_control[0], 2 * y - last_control[1]) if last in ('Q', 'T') else (x, y)
                end = (v[0], v[1])
            else:
                c1, end = (v[0], v[1]), (v[2], v[3])
            for k in range(1, 13):
                t = k / 12
                a, b, c = (1 - t) ** 2, 2 * (1 - t) * t, t * t
                current.append((a * x + b * c1[0] + c * end[0], a * y + b * c1[1] + c * end[1]))
            last_control = c1
            x, y = end
        elif letter == 'A':
            current += arc_points(x, y, v[0], v[1], v[2], v[3], v[4], v[5], v[6])
            x, y = v[5], v[6]
        elif letter == 'Z':
            closed = True
            if len(current) > 1:
                paths.append((current, True))
            current = [current[0]] if current else []
            closed = False
            if current:
                x, y = current[0]
        last = letter
    if len(current) > 1:
        paths.append((current, closed))
    return paths


# ---------------------------------------------------------------- shapes

SHAPES = {
    'rect': ({'x', 'y', 'w', 'h'}, {'r'}),
    'circle': ({'cx', 'cy', 'r'}, set()),
    'ellipse': ({'cx', 'cy', 'rx', 'ry'}, set()),
    'line': ({'x1', 'y1', 'x2', 'y2'}, set()),
    'polyline': ({'points'}, set()),
    'polygon': ({'points'}, set()),
    'path': ({'d'}, {'rule'}),
    'text': ({'text', 'x', 'y'}, {'size', 'anchor'}),
}
PAINT = {'fill', 'stroke', 'width', 'cap', 'join', 'id'}


def check_shapes(check, shapes, path, palette, scale=1):
    if not isinstance(shapes, list) or len(shapes) > 200:
        return check.fail(path, 'must be a list of at most 200 shapes')
    for i, shape in enumerate(shapes):
        here = f'{path}[{i}]'
        if not isinstance(shape, dict) or not check.choice(shape.get('shape'), f'{here}.shape', list(SHAPES)):
            continue
        need, optional = SHAPES[shape['shape']]
        check.fields(shape, here, ['shape', *need, *optional, *PAINT], sorted(need))
        for name in ('x', 'y', 'w', 'h', 'r', 'cx', 'cy', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'size', 'width'):
            if name in shape:
                value = shape[name]
                low = 0 if name in ('w', 'h', 'r', 'rx', 'ry', 'size', 'width') else -LIMIT
                if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= LIMIT:
                    check.fail(f'{here}.{name}', f'must be a number from {low} to {LIMIT}')
        if 'points' in shape:
            pts = shape['points']
            if not isinstance(pts, list) or not 2 <= len(pts) <= 256 or any(
                    not isinstance(p, list) or len(p) != 2 or any(type(a) not in (int, float) or not math.isfinite(a) or abs(a) > LIMIT for a in p) for p in pts):
                check.fail(f'{here}.points', 'must be a list of [x, y] number pairs (2–256)')
        if 'd' in shape:
            try:
                parse_path(shape['d'])
            except ValueError as error:
                check.fail(f'{here}.d', str(error))
        for name in ('fill', 'stroke'):
            if name in shape and shape[name] != 'none':
                check.key(shape[name], f'{here}.{name}', palette)
        if 'cap' in shape:
            check.choice(shape['cap'], f'{here}.cap', ['round', 'butt', 'square'])
        if 'join' in shape:
            check.choice(shape['join'], f'{here}.join', ['round', 'miter', 'bevel'])
        if 'rule' in shape:
            check.choice(shape['rule'], f'{here}.rule', ['nonzero', 'evenodd'])
        if 'anchor' in shape:
            check.choice(shape['anchor'], f'{here}.anchor', ['start', 'middle', 'end'])
        if 'id' in shape and (not isinstance(shape['id'], str) or not vc.IDENT.fullmatch(shape['id'])):
            check.fail(f'{here}.id', 'must be a short lowercase name')
        if 'text' in shape:
            check_text(check, shape['text'], f'{here}.text')


def check_text(check, text, path, longest=40):
    if not isinstance(text, str) or not 1 <= len(text) <= longest:
        return check.fail(path, f'must be text of 1–{longest} characters')
    bad = sorted(set(text.upper()) - set(FONT['glyphs']))
    if bad:
        check.fail(path, f'characters {bad} are not in the bundled font (Latin capitals, digits, . , ! ? - : \' + / &)', sorted(FONT['glyphs']))
    return True


def text_width(text, size):
    unit = size / FONT['cap']
    return (len(text) * FONT['advance'] - (FONT['advance'] - FONT['width'])) * unit if text else 0


def text_paths(text, x, y, size, anchor='start'):
    """Text → path data in the bundled stroke font (baseline at y, cap height = size)."""
    unit = size / FONT['cap']
    width = text_width(text, size)
    x -= {'start': 0, 'middle': width / 2, 'end': width}[anchor]
    parts = []
    for i, char in enumerate(text.upper()):
        d = FONT['glyphs'][char]
        if not d:
            continue
        ox, oy = x + i * FONT['advance'] * unit, y - FONT['cap'] * unit
        parts.append(transform_path(d, unit, ox, oy))
    return ' '.join(parts)


def num(v):
    v = round(v, 3)
    text = f'{v:.3f}'.rstrip('0').rstrip('.')
    return '0' if text in ('-0', '') else text


def transform_path(d, scale, ox, oy):
    out = []
    for letter, v in parse_path(d):
        if letter == 'A':
            v = [v[0] * scale, v[1] * scale, v[2], v[3], v[4], v[5] * scale + ox, v[6] * scale + oy]
            out.append('A' + ' '.join(num(a) if j not in (3, 4) else str(int(a)) for j, a in enumerate(v)))
        else:
            out.append(letter + ' '.join(num(a * scale + (ox if j % 2 == 0 else oy)) for j, a in enumerate(v)))
    return ''.join(out)


# ---------------------------------------------------------------- recipe defaults, validation, building

COMMON = ['schema', 'kind', 'id', 'palette', 'note', 'swap', 'title']
FIELDS = {
    'icon': COMMON + ['name', 'size', 'fill', 'stroke'],
    'illustration': COMMON + ['width', 'height', 'background', 'items', 'layout', 'shapes'],
    'logo': COMMON + ['text', 'emblem', 'layout', 'badge', 'colours', 'size'],
    'diagram': COMMON + ['nodes', 'edges', 'layout', 'columns', 'fill', 'size'],
    'decoration': COMMON + ['type', 'width', 'height', 'fill', 'label', 'shadow'],
    'drawing': COMMON + ['width', 'height', 'grid', 'shapes', 'background'],
}


def defaults(spec):
    kind = spec.get('kind')
    base = {'schema': SCHEMA, 'kind': kind, 'palette': 'meadow', 'swap': {}}
    base.update({
        'icon': {'size': 24},
        'illustration': {'width': 192, 'height': 96, 'background': 'none', 'layout': {'type': 'row', 'gap': 8, 'align': 'bottom', 'padding': 8}, 'shapes': []},
        'logo': {'layout': 'row', 'badge': 'none', 'size': 24, 'colours': {'text': 'k', 'badge': 'w', 'emblem': 'y'}},
        'diagram': {'layout': 'row', 'columns': 3, 'fill': 'w', 'edges': [], 'size': 12},
        'decoration': {'width': 160, 'height': 96, 'fill': 'w', 'shadow': True},
        'drawing': {'width': 48, 'height': 48, 'grid': 1, 'background': 'none'},
    }.get(kind, {}))
    if kind == 'decoration' and spec.get('type') == 'button':
        base.update(width=120, height=44, fill='y')
    result = merge(base, {k: v for k, v in spec.items() if k not in ('layout', 'colours')}) if isinstance(spec, dict) else base
    for name in ('layout', 'colours'):
        if name in spec:
            if isinstance(spec[name], dict) and isinstance(base.get(name), dict):
                result[name] = {**base[name], **spec[name]}
            else:
                result[name] = copy.deepcopy(spec[name])
    return result


def validate(spec):
    check = Check()
    if not isinstance(spec, dict):
        check.fail('', 'a recipe is a JSON object, e.g. {"schema": "visual-core.vector/1", "kind": "icon", "id": "potion", "name": "potion"}')
        check.done()
    if spec.get('schema') != SCHEMA:
        check.fail('schema', f'must be "{SCHEMA}"')
    if not check.choice(spec.get('kind'), 'kind', KINDS):
        check.done()
    check.done()
    result = defaults(spec)
    kind = result['kind']
    check.fields(result, '', FIELDS[kind])
    if not isinstance(result.get('id'), str) or not vc.IDENT.fullmatch(result['id']):
        check.fail('id', 'is a short name: lowercase letters, digits, _ or -, starting with a letter (max 40)')
    if not check.choice(result.get('palette'), 'palette', list(PALETTES['palettes'])):
        check.done()
    palette = result['palette']
    if 'title' in result:
        check_plain(check, result['title'], 'title')
    if 'note' in result and (not isinstance(result['note'], str) or len(result['note']) > 200):
        check.fail('note', 'must be text up to 200 characters')
    if not isinstance(result['swap'], dict):
        check.fail('swap', 'must be an object of key → key')
    else:
        for a, b in result['swap'].items():
            check.key(a, f'swap.{a}')
            check.key(b, f'swap.{a}', palette)
    globals()[f'check_{kind}'](check, result, palette)
    check.done()
    return result


def check_plain(check, value, path):
    if not isinstance(value, str) or not 1 <= len(value) <= 80:
        check.fail(path, 'must be text of 1–80 characters')


def check_size(check, spec, w='width', h='height', low=8):
    check.integer(spec.get(w), w, low, LIMIT)
    check.integer(spec.get(h), h, low, LIMIT)


def check_icon(check, spec, palette):
    check.choice(spec.get('name'), 'name', sorted(ICONS))
    check.choice(spec.get('size'), 'size', [16, 24, 32, 48])
    for name in ('fill', 'stroke'):
        if name in spec:
            check.key(spec[name], name, palette)


def check_items(check, items, palette):
    if not isinstance(items, list) or not 1 <= len(items) <= 32:
        return check.fail('items', 'must be a list of 1–32 pieces like {"piece": "hero"}', sorted(piece_names()))
    for i, item in enumerate(items):
        here = f'items[{i}]'
        if check.fields(item, here, ['piece', 'x', 'y', 'scale', 'swap', 'id'], ('piece',)):
            check.choice(item.get('piece'), f'{here}.piece', sorted(piece_names()))
            for name in ('x', 'y'):
                if name in item and (type(item[name]) not in (int, float) or not math.isfinite(item[name]) or abs(item[name]) > LIMIT):
                    check.fail(f'{here}.{name}', f'must be a number within ±{LIMIT}')
            if 'scale' in item and item['scale'] not in (0.5, 1, 1.5, 2, 3, 4):
                check.fail(f'{here}.scale', 'must be one of 0.5, 1, 1.5, 2, 3, 4')
            if 'swap' in item:
                if not isinstance(item['swap'], dict):
                    check.fail(f'{here}.swap', 'must be an object of key → key')
                else:
                    for a, b in item['swap'].items():
                        check.key(a, f'{here}.swap.{a}')
                        check.key(b, f'{here}.swap.{a}', palette)
            if 'id' in item and (not isinstance(item['id'], str) or not vc.IDENT.fullmatch(item['id'])):
                check.fail(f'{here}.id', 'must be a short lowercase name')


def check_layout(check, layout):
    if check.fields(layout, 'layout', ['type', 'gap', 'align', 'padding', 'columns']):
        check.choice(layout.get('type'), 'layout.type', ['none', 'row', 'column', 'grid'])
        check.choice(layout.get('align', 'center'), 'layout.align', ['start', 'center', 'end', 'bottom', 'top'])
        for name in ('gap', 'padding'):
            if name in layout:
                check.integer(layout[name], f'layout.{name}', 0, 128)
        if 'columns' in layout:
            check.integer(layout['columns'], 'layout.columns', 1, 12)


def check_illustration(check, spec, palette):
    check_size(check, spec)
    if spec.get('background') != 'none':
        check.key(spec.get('background'), 'background', palette)
    check_items(check, spec.get('items'), palette)
    check_layout(check, spec.get('layout'))
    check_shapes(check, spec.get('shapes'), 'shapes', palette)


def check_logo(check, spec, palette):
    check_text(check, spec.get('text'), 'text', 24)
    if 'emblem' in spec:
        check.choice(spec['emblem'], 'emblem', sorted(ICONS))
    check.choice(spec.get('layout'), 'layout', ['row', 'column'])
    check.choice(spec.get('badge'), 'badge', ['none', 'round', 'pill', 'square'])
    check.integer(spec.get('size'), 'size', 8, 96)
    colours = spec.get('colours')
    if check.fields(colours, 'colours', ['text', 'badge', 'emblem']):
        for name, key in colours.items():
            check.key(key, f'colours.{name}', palette)
        if spec.get('badge') != 'none' and colours.get('text') in KEYS and colours.get('badge') in KEYS and resolve_key(palette, colours['text']) and resolve_key(palette, colours['badge']):
            ratio = vc.contrast(resolve_key(palette, colours['text']), resolve_key(palette, colours['badge']))
            if ratio < 4.5:
                check.fail('colours', f'text on badge contrast is {ratio:.2f}:1; choose keys with at least 4.5:1 (ink k on paper w works)')


def check_diagram(check, spec, palette):
    nodes = spec.get('nodes')
    if not isinstance(nodes, list) or not 1 <= len(nodes) <= 24:
        check.fail('nodes', 'must be a list of 1–24 {"id": "a", "label": "Start"}')
        return
    ids = []
    for i, node in enumerate(nodes):
        here = f'nodes[{i}]'
        if check.fields(node, here, ['id', 'label', 'fill'], ('id', 'label')):
            if not isinstance(node.get('id'), str) or not vc.IDENT.fullmatch(node['id']) or node['id'] in ids:
                check.fail(f'{here}.id', 'must be a new short lowercase name')
            ids.append(node.get('id'))
            check_text(check, node.get('label'), f'{here}.label', 18)
            if 'fill' in node:
                check.key(node['fill'], f'{here}.fill', palette)
    edges = spec.get('edges')
    if not isinstance(edges, list) or len(edges) > 48:
        return check.fail('edges', 'must be a list of at most 48 {"from": "a", "to": "b"}')
    for i, edge in enumerate(edges):
        here = f'edges[{i}]'
        if check.fields(edge, here, ['from', 'to'], ('from', 'to')):
            for end in ('from', 'to'):
                check.choice(edge.get(end), f'{here}.{end}', ids)
    check.choice(spec.get('layout'), 'layout', ['row', 'column', 'grid'])
    check.integer(spec.get('columns'), 'columns', 1, 8)
    check.integer(spec.get('size'), 'size', 8, 32)
    check.key(spec.get('fill'), 'fill', palette)


def check_decoration(check, spec, palette):
    check.choice(spec.get('type'), 'type', ['card', 'panel', 'button', 'divider', 'badge'])
    check_size(check, spec)
    check.key(spec.get('fill'), 'fill', palette)
    if type(spec.get('shadow')) is not bool:
        check.fail('shadow', 'must be true or false')
    if 'label' in spec:
        check_text(check, spec['label'], 'label', 24)
        if spec.get('type') not in ('button', 'badge'):
            check.fail('label', 'only buttons and badges have a label')
        elif check.problems == [] and text_width(spec['label'].upper(), 16) + 24 > spec['width']:
            check.fail('label', f'is too wide; shorten it or set width ≥ {math.ceil(text_width(spec["label"], 16) + 24)}')


def check_drawing(check, spec, palette):
    check_size(check, spec, low=1)
    check.integer(spec.get('grid'), 'grid', 1, 64)
    if spec.get('background') != 'none':
        check.key(spec.get('background'), 'background', palette)
    check_shapes(check, spec.get('shapes'), 'shapes', palette)
    if not check.problems and spec['grid'] * max(spec['width'], spec['height']) > LIMIT:
        check.fail('grid', f'grid × size must stay within {LIMIT}')


def piece_names():
    return [*PIECES['pieces'], *(f'icon.{n}' for n in ICONS)]


def piece(name):
    if name.startswith('icon.'):
        entry = ICONS[name[5:]]
        return {'width': 24, 'height': 24, 'defaults': PIECES['icon_defaults'], 'shapes': entry['shapes']}
    return PIECES['pieces'][name]


# A built drawing is a list of nodes: ('g', attrs, children) or (shape dict with resolved paint).

def paint(shape, defaults):
    result = {**defaults, **shape}
    return result


def place(nodes, dx=0, dy=0, scale=1, swap=None, gid=None):
    return {'group': nodes, 'dx': dx, 'dy': dy, 'scale': scale, 'swap': swap or {}, 'id': gid}


def build(spec):
    """Recipe → (width, height, node tree). Layout happens here; no randomness."""
    kind = spec['kind']
    return globals()[f'build_{kind}'](spec)


def build_icon(spec):
    shapes = [paint(s, PIECES['icon_defaults']) for s in ICONS[spec['name']]['shapes']]
    stroke = 1.5 if spec['size'] == 16 else 2
    for s in shapes:
        if s.get('stroke', 'none') != 'none':
            s['width'] = s.get('width', 2) * stroke / 2
            if 'stroke' in spec:
                s['stroke'] = spec['stroke'] if s['stroke'] == 'k' else s['stroke']
        if 'fill' in spec and s.get('fill') == ICONS[spec['name']].get('fill_key'):
            s['fill'] = spec['fill']
    return 24, 24, [place(shapes, gid='icon')], spec['size']


def item_box(item):
    p = piece(item['piece'])
    s = item.get('scale', 1)
    return p['width'] * s, p['height'] * s


def build_illustration(spec):
    w, h, layout = spec['width'], spec['height'], spec['layout']
    nodes = []
    if spec['background'] != 'none':
        nodes.append(place([{'shape': 'rect', 'x': 0, 'y': 0, 'w': w, 'h': h, 'fill': spec['background'], 'stroke': 'none'}], gid='background'))
    boxes = [item_box(i) for i in spec['items']]
    pad, gap, kind = layout.get('padding', 8), layout.get('gap', 8), layout['type']
    align = layout.get('align', 'center')
    positions = []
    if kind == 'row':
        total = sum(b[0] for b in boxes) + gap * (len(boxes) - 1)
        x = (w - total) / 2
        for bw, bh in boxes:
            y = {'top': pad, 'start': pad, 'center': (h - bh) / 2, 'bottom': h - pad - bh, 'end': h - pad - bh}[align]
            positions.append((x, y))
            x += bw + gap
    elif kind == 'column':
        total = sum(b[1] for b in boxes) + gap * (len(boxes) - 1)
        y = (h - total) / 2
        for bw, bh in boxes:
            x = {'start': pad, 'top': pad, 'center': (w - bw) / 2, 'end': w - pad - bw, 'bottom': w - pad - bw}[align]
            positions.append((x, y))
            y += bh + gap
    elif kind == 'grid':
        cols = layout.get('columns', 3)
        cw = max(b[0] for b in boxes)
        ch = max(b[1] for b in boxes)
        for i, (bw, bh) in enumerate(boxes):
            positions.append((pad + (i % cols) * (cw + gap) + (cw - bw) / 2, pad + (i // cols) * (ch + gap) + (ch - bh) / 2))
    else:
        positions = [(0, 0)] * len(boxes)
    for i, (item, (x, y)) in enumerate(zip(spec['items'], positions)):
        p = piece(item['piece'])
        x, y = item.get('x', x), item.get('y', y)
        shapes = [paint(s, p.get('defaults', {})) for s in p['shapes']]
        nodes.append(place(shapes, round(x, 3), round(y, 3), item.get('scale', 1), item.get('swap'), item.get('id', f'item-{i + 1}')))
    if spec['shapes']:
        nodes.append(place([paint(s, {'fill': 'none', 'stroke': 'k', 'width': 2}) for s in spec['shapes']], gid='shapes'))
    return w, h, nodes, None


def build_logo(spec):
    size, colours = spec['size'], spec['colours']
    tw = text_width(spec['text'], size)
    stroke = max(1.0, round(size / 8, 2))
    emblem = 'emblem' in spec
    es = size * 2 if spec['layout'] == 'column' else size * 1.5
    gap = size / 2
    pad = size / 2 if spec['badge'] != 'none' else stroke
    if spec['layout'] == 'row':
        cw = (es + gap if emblem else 0) + tw
        ch = max(es if emblem else 0, size)
    else:
        cw = max(es if emblem else 0, tw)
        ch = (es + gap if emblem else 0) + size
    w, h = math.ceil(cw + 2 * pad), math.ceil(ch + 2 * pad)
    if spec['badge'] == 'round':
        w = h = max(w, h)
    nodes = []
    if spec['badge'] != 'none':
        if spec['badge'] == 'round':
            badge = {'shape': 'circle', 'cx': w / 2, 'cy': h / 2, 'r': w / 2 - stroke}
        else:
            badge = {'shape': 'rect', 'x': stroke, 'y': stroke, 'w': w - 2 * stroke, 'h': h - 2 * stroke, 'r': (h / 2 - stroke) if spec['badge'] == 'pill' else 4}
        nodes.append(place([{**badge, 'fill': colours['badge'], 'stroke': 'k', 'width': stroke}], gid='badge'))
    ox, oy = (w - cw) / 2, (h - ch) / 2
    if emblem:
        ex, ey = (ox, oy + (ch - es) / 2) if spec['layout'] == 'row' else (ox + (cw - es) / 2, oy)
        shapes = [paint(s, PIECES['icon_defaults']) for s in ICONS[spec['emblem']]['shapes']]
        fill_key = ICONS[spec['emblem']].get('fill_key')
        for s in shapes:
            if s.get('fill') == fill_key:
                s['fill'] = colours['emblem']
        nodes.append(place(shapes, round(ex, 3), round(ey, 3), es / 24, None, 'emblem'))
        tx, ty = (ox + es + gap, oy + (ch + size) / 2) if spec['layout'] == 'row' else (ox + (cw - tw) / 2, oy + es + gap + size)
    else:
        tx, ty = ox, oy + size
    nodes.append(place([{'shape': 'text', 'text': spec['text'], 'x': round(tx, 3), 'y': round(ty, 3), 'size': size, 'stroke': colours['text'], 'fill': 'none', 'width': stroke}], gid='wordmark'))
    return w, h, nodes, None


def build_diagram(spec):
    size = spec['size']
    stroke = 2
    nodes_by_id = {}
    widths = [math.ceil(text_width(n['label'], size)) + size * 2 for n in spec['nodes']]
    bw, bh = max(widths), size * 3
    gap = size * 3
    cols = {'row': len(spec['nodes']), 'column': 1, 'grid': spec['columns']}[spec['layout']]
    for i, node in enumerate(spec['nodes']):
        x, y = 4 + (i % cols) * (bw + gap), 4 + (i // cols) * (bh + gap)
        nodes_by_id[node['id']] = (x, y)
    rows = (len(spec['nodes']) + cols - 1) // cols
    w = 8 + min(cols, len(spec['nodes'])) * (bw + gap) - gap
    h = 8 + rows * (bh + gap) - gap + 4
    edges = []
    for edge in spec['edges']:
        (ax, ay), (bx, by) = nodes_by_id[edge['from']], nodes_by_id[edge['to']]
        acx, acy, bcx, bcy = ax + bw / 2, ay + bh / 2, bx + bw / 2, by + bh / 2
        if ay == by:
            sx, sy, ex, ey = (ax + bw, acy, bx, bcy) if bx > ax else (ax, acy, bx + bw, bcy)
        elif ax == bx:
            sx, sy, ex, ey = (acx, ay + bh, bcx, by) if by > ay else (acx, ay, bcx, by + bh)
        else:
            sx, sy = (ax + bw, acy) if bx > ax else (ax, acy)
            ex, ey = (bcx, by) if by > ay else (bcx, by + bh)
        d = f'M{num(sx)} {num(sy)}L{num(ex)} {num(ey)}'
        ang = math.atan2(ey - sy, ex - sx)
        head = size * 0.6
        p1 = (ex - head * math.cos(ang - 0.5), ey - head * math.sin(ang - 0.5))
        p2 = (ex - head * math.cos(ang + 0.5), ey - head * math.sin(ang + 0.5))
        d += f'M{num(p1[0])} {num(p1[1])}L{num(ex)} {num(ey)}L{num(p2[0])} {num(p2[1])}'
        edges.append({'shape': 'path', 'd': d, 'stroke': 'k', 'width': stroke, 'fill': 'none'})
    out = [place(edges, gid='edges')] if edges else []
    boxes = []
    for node in spec['nodes']:
        x, y = nodes_by_id[node['id']]
        boxes.append({'shape': 'rect', 'x': x + 0, 'y': y + 3, 'w': bw, 'h': bh, 'r': 4, 'fill': 'k', 'stroke': 'none'})
        boxes.append({'shape': 'rect', 'x': x, 'y': y, 'w': bw, 'h': bh, 'r': 4, 'fill': node.get('fill', spec['fill']), 'stroke': 'k', 'width': stroke})
        boxes.append({'shape': 'text', 'text': node['label'], 'x': x + bw / 2, 'y': y + bh / 2 + size / 2, 'size': size, 'anchor': 'middle', 'stroke': 'k', 'fill': 'none', 'width': max(1, size / 8)})
    out.append(place(boxes, gid='nodes'))
    return w, h, out, None


def build_decoration(spec):
    w, h, kind, fill = spec['width'], spec['height'], spec['type'], spec['fill']
    shadow = 4 if spec['shadow'] else 0
    shapes = []
    if kind in ('card', 'panel', 'button', 'badge'):
        r = {'card': 8, 'panel': 4, 'button': 6, 'badge': (h - shadow - 2) / 2}[kind]
        if shadow:
            shapes.append({'shape': 'rect', 'x': 1, 'y': 1 + shadow, 'w': w - 2, 'h': h - 2 - shadow, 'r': r, 'fill': 'k', 'stroke': 'none'})
        shapes.append({'shape': 'rect', 'x': 1, 'y': 1, 'w': w - 2, 'h': h - 2 - shadow, 'r': r, 'fill': fill, 'stroke': 'k', 'width': 2})
        if 'label' in spec:
            shapes.append({'shape': 'text', 'text': spec['label'].upper(), 'x': w / 2, 'y': (h - shadow) / 2 + 8, 'size': 16 if kind == 'button' else 12,
                           'anchor': 'middle', 'stroke': 'k', 'fill': 'none', 'width': 2})
    else:
        mid = h / 2
        shapes += [{'shape': 'line', 'x1': 2, 'y1': mid, 'x2': w / 2 - 10, 'y2': mid, 'stroke': 'k', 'width': 2, 'cap': 'round'},
                   {'shape': 'line', 'x1': w / 2 + 10, 'y1': mid, 'x2': w - 2, 'y2': mid, 'stroke': 'k', 'width': 2, 'cap': 'round'},
                   {'shape': 'polygon', 'points': [[w / 2, mid - 6], [w / 2 + 6, mid], [w / 2, mid + 6], [w / 2 - 6, mid]], 'fill': fill, 'stroke': 'k', 'width': 2}]
    return w, h, [place(shapes, gid=kind)], None


def build_drawing(spec):
    g = spec['grid']
    w, h = spec['width'] * g, spec['height'] * g
    nodes = []
    if spec['background'] != 'none':
        nodes.append(place([{'shape': 'rect', 'x': 0, 'y': 0, 'w': w, 'h': h, 'fill': spec['background'], 'stroke': 'none'}], gid='background'))
    shapes = []
    for s in spec['shapes']:
        s = paint(s, {'fill': 'none', 'stroke': 'k', 'width': 2 / g, 'cap': 'round', 'join': 'round'})
        shapes.append(s)
    nodes.append(place(shapes, 0, 0, g, None, 'drawing'))
    return w, h, nodes, None


# ---------------------------------------------------------------- SVG writer

def colour(key, palette, swap):
    if key in (None, 'none'):
        return 'none'
    return resolve_key(palette, swap.get(key, key))


def shape_svg(s, palette, swap):
    attrs = []
    kind = s['shape']
    if kind == 'text':
        d = text_paths(s['text'], s['x'], s['y'], s.get('size', 12), s.get('anchor', 'start'))
        return (f'<path d="{d}" fill="none" stroke="{colour(s.get("stroke", "k"), palette, swap)}" stroke-width="{num(s.get("width", 2))}" '
                'stroke-linecap="round" stroke-linejoin="round"/>')
    geometry = {
        'rect': lambda: [('x', s['x']), ('y', s['y']), ('width', s['w']), ('height', s['h'])] + ([('rx', s['r'])] if s.get('r') else []),
        'circle': lambda: [('cx', s['cx']), ('cy', s['cy']), ('r', s['r'])],
        'ellipse': lambda: [('cx', s['cx']), ('cy', s['cy']), ('rx', s['rx']), ('ry', s['ry'])],
        'line': lambda: [('x1', s['x1']), ('y1', s['y1']), ('x2', s['x2']), ('y2', s['y2'])],
    }
    tag = kind
    if kind in geometry:
        attrs += [f'{k}="{num(v)}"' for k, v in geometry[kind]()]
    elif kind in ('polyline', 'polygon'):
        attrs.append('points="' + ' '.join(f'{num(x)},{num(y)}' for x, y in s['points']) + '"')
    else:
        parse_path(s['d'])
        attrs.append('d="' + ' '.join(s['d'].split()) + '"')
        if s.get('rule') == 'evenodd':
            attrs.append('fill-rule="evenodd"')
    attrs.append(f'fill="{colour(s.get("fill", "none"), palette, swap)}"')
    stroke = colour(s.get('stroke', 'none'), palette, swap)
    attrs.append(f'stroke="{stroke}"')
    if stroke != 'none':
        attrs.append(f'stroke-width="{num(s.get("width", 2))}"')
        attrs.append(f'stroke-linecap="{s.get("cap", "round")}"')
        attrs.append(f'stroke-linejoin="{s.get("join", "round")}"')
    if 'id' in s:
        attrs.insert(0, f'id="{s["id"]}"')
    return f'<{tag} ' + ' '.join(attrs) + '/>'


def svg(spec, width, height, nodes, display=None):
    palette, swap = spec['palette'], spec['swap']
    title = html.escape(spec.get('title', spec['id']))
    dw, dh = (display, display) if display else (width, height)
    body = []
    for node in nodes:
        local = {**swap, **node['swap']}
        transform = ''
        if node['dx'] or node['dy'] or node['scale'] != 1:
            transform = f' transform="translate({num(node["dx"])} {num(node["dy"])})' + (f' scale({num(node["scale"])})' if node['scale'] != 1 else '') + '"'
        gid = f' id="{node["id"]}"' if node['id'] else ''
        body.append(f'<g{gid}{transform}>' + ''.join(shape_svg(s, palette, local) for s in node['group']) + '</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{num(dw)}" height="{num(dh)}" viewBox="0 0 {num(width)} {num(height)}" '
            f'role="img" aria-labelledby="title"><title id="title">{title}</title>' + ''.join(body) + '</svg>\n')


# ---------------------------------------------------------------- rasteriser (preview only)

def circle_points(cx, cy, rx, ry, n=48):
    return [(cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n)) for k in range(n)]


def rounded_rect(x, y, w, h, r):
    r = max(0.0, min(r, w / 2, h / 2))
    if r == 0:
        return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    pts = []
    for cx, cy, start in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for k in range(9):
            a = math.radians(start + 90 * k / 8)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def geometry(s):
    """Shape → (fill polygons, stroke polylines [(points, closed)])."""
    kind = s['shape']
    if kind == 'rect':
        poly = rounded_rect(s['x'], s['y'], s['w'], s['h'], s.get('r', 0))
        return [poly], [(poly, True)]
    if kind in ('circle', 'ellipse'):
        rx, ry = (s['r'], s['r']) if kind == 'circle' else (s['rx'], s['ry'])
        poly = circle_points(s['cx'], s['cy'], rx, ry)
        return [poly], [(poly, True)]
    if kind == 'line':
        line = [(s['x1'], s['y1']), (s['x2'], s['y2'])]
        return [], [(line, False)]
    if kind in ('polyline', 'polygon'):
        pts = [tuple(p) for p in s['points']]
        return ([pts] if kind == 'polygon' else [pts]), [(pts, kind == 'polygon')]
    if kind == 'text':
        d = text_paths(s['text'], s['x'], s['y'], s.get('size', 12), s.get('anchor', 'start'))
        return [], flatten(parse_path(d))
    subpaths = flatten(parse_path(s['d']))
    return [p for p, _ in subpaths], subpaths


def area(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly))) / 2


def positive(poly):
    return poly if area(poly) >= 0 else poly[::-1]


def stroke_polygons(polylines, width, cap):
    h = width / 2
    polys = []
    for points, closed in polylines:
        pts = list(points) + ([points[0]] if closed else [])
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            dx, dy = x2 - x1, y2 - y1
            length = math.hypot(dx, dy)
            if length == 0:
                continue
            nx, ny = -dy / length * h, dx / length * h
            ex, ey = (dx / length * h, dy / length * h) if cap == 'square' else (0, 0)
            polys.append(positive([(x1 + nx - ex, y1 + ny - ey), (x2 + nx + ex, y2 + ny + ey), (x2 - nx + ex, y2 - ny + ey), (x1 - nx - ex, y1 - ny - ey)]))
        joints = pts if (cap == 'round' or closed) else pts[1:-1]
        for x, y in joints:
            polys.append(positive(circle_points(x, y, h, h, 16)))
    return polys


def coverage(polys, W, H, rule='nonzero', sub=4):
    """Per-pixel coverage (0..1) of polygons in pixel space; scanline with sub rows."""
    edges = []
    for poly in polys:
        for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
            if y1 != y2:
                edges.append((x1, y1, x2, y2, 1 if y2 > y1 else -1))
    cov = {}
    if not edges:
        return cov
    top = max(0, int(math.floor(min(min(e[1], e[3]) for e in edges))))
    bottom = min(H, int(math.ceil(max(max(e[1], e[3]) for e in edges))) + 1)
    for row in range(top, bottom):
        line = None
        for k in range(sub):
            ys = row + (k + 0.5) / sub
            xs = []
            for x1, y1, x2, y2, wdir in edges:
                if (y1 <= ys < y2) or (y2 <= ys < y1):
                    xs.append((x1 + (ys - y1) * (x2 - x1) / (y2 - y1), wdir))
            if not xs:
                continue
            xs.sort()
            wind, start = 0, None
            for x, wdir in xs:
                before = wind
                wind = wind + wdir if rule == 'nonzero' else (wind + 1) % 2
                inside_before, inside_after = before != 0, wind != 0
                if not inside_before and inside_after:
                    start = x
                elif inside_before and not inside_after and start is not None:
                    a, b = max(0.0, start), min(float(W), x)
                    if b > a:
                        if line is None:
                            line = [0.0] * W
                        ia, ib = int(a), int(b)
                        if ia == ib:
                            line[ia] += (b - a) / sub
                        else:
                            line[ia] += (ia + 1 - a) / sub
                            for p in range(ia + 1, min(ib, W)):
                                line[p] += 1 / sub
                            if ib < W:
                                line[ib] += (b - ib) / sub
        if line is not None:
            cov[row] = line
    return cov


def rasterise(spec, width, height, nodes, scale):
    W, H = max(1, int(round(width * scale))), max(1, int(round(height * scale)))
    px = [[0.0, 0.0, 0.0, 0.0] for _ in range(W * H)]
    palette = spec['palette']

    def blend(cov, hexcolor):
        r, g, b = (int(hexcolor[i:i + 2], 16) / 255 for i in (1, 3, 5))
        for row, line in cov.items():
            base = row * W
            for x, a in enumerate(line):
                if a <= 0:
                    continue
                a = min(1.0, a)
                p = px[base + x]
                inv = 1 - a
                p[0], p[1], p[2], p[3] = r * a + p[0] * inv, g * a + p[1] * inv, b * a + p[2] * inv, a + p[3] * inv
    for node in nodes:
        swap = {**spec['swap'], **node['swap']}

        def tx(pt, node=node):
            return ((pt[0] * node['scale'] + node['dx']) * scale, (pt[1] * node['scale'] + node['dy']) * scale)
        for s in node['group']:
            fills, lines = geometry(s)
            fill = colour(s.get('fill', 'none'), palette, swap)
            if fill != 'none' and fills:
                blend(coverage([[tx(p) for p in poly] for poly in fills], W, H, s.get('rule', 'nonzero')), fill)
            stroke = colour(s.get('stroke', 'none') if s['shape'] != 'text' else s.get('stroke', 'k'), palette, swap)
            if stroke != 'none' and lines:
                width_px = s.get('width', 2) * node['scale'] * scale
                cap = 'round' if s['shape'] == 'text' else s.get('cap', 'round')
                polys = stroke_polygons([([tx(p) for p in pts], closed) for pts, closed in lines], width_px, cap)
                blend(coverage(polys, W, H), stroke)
    out = bytearray(W * H * 4)
    for i, (r, g, b, a) in enumerate(px):
        if a > 0:
            out[i * 4:i * 4 + 4] = bytes((round(r / a * 255), round(g / a * 255), round(b / a * 255), round(a * 255)))
    return W, H, bytes(out)


# ---------------------------------------------------------------- render, revise, catalog, CLI

def render(spec, folder, previous=None):
    spec = validate(spec)
    folder = Path(folder)
    width, height, nodes, display = build(spec)
    text = svg(spec, width, height, nodes, display)
    safety = svg_safety(text)
    (folder/'asset.svg').write_text(text, encoding='utf8')
    scale = max(1, min(10, 512 // max(width, height))) if max(width, height) <= 512 else 512 / max(width, height)
    W, H, data = rasterise(spec, width, height, nodes, scale)
    (folder/'preview.png').write_bytes(vc.png(W, H, data))
    vc.write_json(folder/'spec.json', spec)
    manifest = {'schema': 'visual-core.vector-manifest/1', 'version': vc.VERSION, 'source': 'spec.json', 'kind': spec['kind'],
                'svg': 'asset.svg', 'viewbox': [0, 0, width, height], 'preview': {'image': 'preview.png', 'width': W, 'height': H, 'scale': scale},
                'palette': {'name': spec['palette'], 'colors': {k: resolve_key(spec['palette'], k) for k in KEYS if resolve_key(spec['palette'], k)}},
                'groups': [n['id'] for n in nodes if n['id']], 'svg_sha256': hashlib.sha256(text.encode()).hexdigest(),
                'pixel_sha256': hashlib.sha256(data).hexdigest(), 'quality': safety, 'font': FONT['name'], 'visual_review': 'not-performed'}
    vc.write_json(folder/'manifest.json', manifest)
    (folder/'preview.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                                      '<title>Vector preview</title><style>body{font:16px system-ui;background:#f6f3eb;color:#172f36;max-width:960px;margin:40px auto;padding:16px}'
                                      'img{max-width:100%;background:repeating-conic-gradient(#d9dedb 0 25%,#fff 0 50%) 0/16px 16px}</style><h1>' + html.escape(spec['id']) + '</h1>'
                                      f'<h2>SVG</h2><img src="asset.svg" alt="{html.escape(spec["id"])}"><h2>PNG preview</h2><img src="preview.png" alt="Rendered preview" width="{W}" height="{H}">'
                                      '<p>Editable source: <a href="spec.json">spec.json</a>; groups and hashes: <a href="manifest.json">manifest.json</a>.</p></html>')
    return {'width': width, 'height': height, 'preview': [W, H], 'groups': manifest['groups'], 'quality': safety}


def svg_safety(text):
    """Refuse anything but the elements and attributes this module writes."""
    from xml.etree import ElementTree
    root = ElementTree.fromstring(text)
    allowed_tags = {'svg', 'title', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path'}
    allowed_attrs = {'xmlns', 'width', 'height', 'viewBox', 'role', 'aria-labelledby', 'id', 'transform', 'x', 'y', 'rx', 'cx', 'cy', 'r', 'ry',
                     'x1', 'y1', 'x2', 'y2', 'points', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule'}
    for element in root.iter():
        tag = element.tag.split('}')[-1]
        if tag not in allowed_tags:
            raise ValueError(f'unexpected SVG element {tag}')
        for name, value in element.attrib.items():
            if name not in allowed_attrs or 'url(' in value or 'javascript' in value.lower():
                raise ValueError(f'unexpected SVG attribute {name}')
    return {'elements_allowed': True, 'no_scripts': True, 'no_external_references': True, 'text_as_paths': True, 'passed': True}


def patch(spec, change):
    check = Check()
    check.fields(change, 'patch', ['set'], ('set',))
    updates = change.get('set') if isinstance(change, dict) else None
    if not isinstance(updates, dict):
        check.fail('patch.set', 'must be an object of fields to change, e.g. {"set": {"fill": "b"}}')
    else:
        for fixed in ('schema', 'kind', 'id'):
            if fixed in updates and updates[fixed] != spec.get(fixed):
                check.fail(f'patch.set.{fixed}', 'cannot change in a revision; create a new asset instead')
    check.done()
    return validate(merge(spec, updates))


def catalog():
    return {'schema': SCHEMA, 'kinds': list(KINDS), 'palettes': list(PALETTES['palettes']), 'keys': PALETTES['names'],
            'icons': {n: {'fill_key': i.get('fill_key')} for n, i in ICONS.items()}, 'pieces': sorted(piece_names()),
            'shapes': {k: sorted(v[0] | v[1] | PAINT) for k, v in SHAPES.items()},
            'decoration_types': ['card', 'panel', 'button', 'divider', 'badge'], 'logo_badges': ['none', 'round', 'pill', 'square'],
            'layouts': ['none', 'row', 'column', 'grid'], 'font': {'name': FONT['name'], 'characters': ''.join(sorted(FONT['glyphs']))},
            'templates': sorted(p.stem for p in (vc.ROOT/'presets/vector').glob('*.json')),
            'outputs': ['asset.svg', 'preview.png', 'manifest.json', 'spec.json', 'preview.html']}


def template(name):
    check = Check()
    check.choice(name, 'template', sorted(p.stem for p in (vc.ROOT/'presets/vector').glob('*.json')))
    check.done()
    return load(vc.ROOT/'presets/vector'/f'{name}.json')


def main(argv):
    import argparse
    parser = argparse.ArgumentParser(prog='visual.py vector', description=__doc__)
    actions = parser.add_subparsers(dest='action', required=True)
    actions.add_parser('catalog')
    p = actions.add_parser('template'); p.add_argument('name')
    p = actions.add_parser('check'); p.add_argument('recipe')
    p = actions.add_parser('create'); p.add_argument('recipe'); p.add_argument('--out', required=True)
    p = actions.add_parser('read'); p.add_argument('asset')
    p = actions.add_parser('revise'); p.add_argument('asset'); p.add_argument('--base', type=int, required=True); p.add_argument('--patch', required=True)
    args = parser.parse_args(argv)
    try:
        if args.action == 'catalog':
            result = catalog()
        elif args.action == 'template':
            result = template(args.name)
        elif args.action == 'check':
            result = {'valid': True, 'resolved': validate(load(args.recipe)), 'visual_review': 'not-performed'}
        elif args.action == 'create':
            result = vc.publish(args.out, validate(load(args.recipe)))
        elif args.action == 'read':
            result = vc.read_asset(args.asset)
        else:
            result = vc.publish(args.asset, base=args.base, patch=load(args.patch))
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except RecipeError as error:
        print(json.dumps({'error': str(error), 'problems': error.problems, 'published': False}, ensure_ascii=False))
        return 1
    except (ValueError, OSError, KeyError, TypeError, OverflowError) as error:
        print(json.dumps({'error': str(error), 'published': False}, ensure_ascii=False))
        return 1
