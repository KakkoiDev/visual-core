"""Deterministic pixel art from small recipes.

The model picks and parameterises (kind, palette, named parts, frames, seed); this
module validates the recipe, draws it from the content packs with integer-only
primitives and writes PNG sheets plus a manifest. Same recipe, same pixels.
"""
import copy
import difflib
import hashlib
import html
import json
from pathlib import Path

import visual_core as vc

SCHEMA = 'visual-core.pixel/1'
CONTENT = vc.ROOT/'content'
SIZES = (16, 32, 64)
KINDS = ('character', 'monster', 'item', 'icon', 'tile', 'frame', 'button', 'building', 'sprite')
# Designer card ArtSprites: frame counts and timings are fixed per action.
ACTIONS = {'idle': [500, 500], 'walk': [120, 120, 120, 120], 'attack': [80, 60, 140],
           'hurt': [80, 160], 'die': [100, 100, 100, 100]}
STATES = ('normal', 'focus', 'pressed', 'disabled')
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
LIMIT = 256  # largest canvas edge in pixels (frames and buttons); sprites stay ≤ 64


def _json(name):
    return json.loads((CONTENT/name).read_text(encoding='utf8'))


PALETTES = _json('palettes.json')
KEYS = PALETTES['keys']
SHADE, LIGHT = PALETTES['shade'], PALETTES['light']
PACKS = {name: _json(f'pixel/{name}.json') for name in
         ('characters', 'monsters', 'items', 'icons', 'tiles', 'frames', 'buildings', 'font')}


class RecipeError(ValueError):
    """A list of problems, each with the JSON path, what is wrong and what to use."""

    def __init__(self, problems):
        self.problems = problems
        head = f'{len(problems)} problem{"s" if len(problems) > 1 else ""} in the recipe: ' if len(problems) > 1 else ''
        super().__init__(head + ' | '.join(p['message'] for p in problems))


class Check:
    """Collects every problem instead of stopping at the first one."""

    def __init__(self):
        self.problems = []

    def fail(self, path, problem, allowed=None, got=None):
        message = f'{path}: {problem}' if path else problem
        entry = {'path': path, 'problem': problem}
        if allowed is not None:
            allowed = [str(a) for a in allowed]
            entry['allowed'] = allowed
            message += '. Use one of: ' + ', '.join(allowed[:24]) + ('…' if len(allowed) > 24 else '')
            close = difflib.get_close_matches(str(got), allowed, 1, 0.6) if isinstance(got, str) else []
            if close:
                message += f". Did you mean '{close[0]}'?"
        entry['message'] = message
        self.problems.append(entry)
        return False

    def fields(self, value, path, allowed, required=()):
        if not isinstance(value, dict):
            return self.fail(path or 'recipe', 'must be a JSON object {…}')
        for name in sorted(set(value) - set(allowed)):
            self.fail(f'{path}.{name}' if path else name, 'is not a field here', sorted(allowed), name)
        for name in required:
            if name not in value:
                self.fail(f'{path}.{name}' if path else name, 'is required')
        return True

    def choice(self, value, path, allowed):
        if value not in allowed:
            got = repr(value) if not isinstance(value, str) else f"'{value}'"
            return self.fail(path, f'{got} is not a choice', allowed, value)
        return True

    def integer(self, value, path, low, high):
        if type(value) is not int or not low <= value <= high:
            return self.fail(path, f'must be a whole number from {low} to {high} (got {json.dumps(value)})')
        return True

    def key(self, value, path, palette=None):
        if not isinstance(value, str) or value not in KEYS:
            return self.fail(path, f'{json.dumps(value)} is not a palette key', KEYS, value)
        if palette and resolve_key(palette, value) is None:
            return self.fail(path, f"key '{value}' has no colour or fallback in palette {palette}",
                             sorted(PALETTES['palettes'][palette]['colors']))
        return True

    def done(self):
        if self.problems:
            raise RecipeError(self.problems)


def resolve_key(palette, key):
    entry = PALETTES['palettes'][palette]
    if key in entry['colors']:
        return entry['colors'][key]
    target = entry['fallback'].get(key)
    return entry['colors'].get(target) if target else None


def rnd(seed, label, index=0):
    """Stable integer from a seed and a label; no dependency on Python's random module."""
    digest = hashlib.sha256(f'{seed}:{label}:{index}'.encode()).digest()
    return int.from_bytes(digest[:8], 'big')


# ---------------------------------------------------------------- canvas and primitives

def blank(w, h):
    return [[None] * w for _ in range(h)]


def clone(canvas):
    return [row[:] for row in canvas]


def size_of(canvas):
    return (len(canvas[0]) if canvas else 0), len(canvas)


def put(canvas, x, y, key, clip=None):
    w, h = size_of(canvas)
    if 0 <= x < w and 0 <= y < h and (clip is None or (clip[0] <= x < clip[0] + clip[2] and clip[1] <= y < clip[1] + clip[3])):
        canvas[y][x] = None if key == '.' else key


def composite(under, over, dx=0, dy=0):
    w, h = size_of(over)
    for y in range(h):
        for x in range(w):
            if over[y][x] is not None:
                put(under, x + dx, y + dy, over[y][x])
    return under


def line_points(x1, y1, x2, y2):
    dx, dy = abs(x2 - x1), -abs(y2 - y1)
    sx, sy = (1 if x1 < x2 else -1), (1 if y1 < y2 else -1)
    err, points = dx + dy, []
    while True:
        points.append((x1, y1))
        if x1 == x2 and y1 == y2:
            return points
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x1 += sx
        if e2 <= dx:
            err += dx
            y1 += sy


def inside_polygon(px2, py2, points2):
    """Even-odd test of a doubled pixel centre against doubled integer vertices."""
    inside, n = False, len(points2)
    for i in range(n):
        x1, y1 = points2[i]
        x2, y2 = points2[(i + 1) % n]
        if (y1 > py2) != (y2 > py2):
            # Compare px2 < x1 + (py2-y1)*(x2-x1)/(y2-y1) without division.
            lhs = (px2 - x1) * (y2 - y1)
            rhs = (py2 - y1) * (x2 - x1)
            if (lhs < rhs) if y2 > y1 else (lhs > rhs):
                inside = not inside
    return inside


def outline(canvas, mode='full', ink='k'):
    """1-pixel outline into empty pixels that touch a filled one (4-neighbour).

    selective: outline pixels on the top or left of a form take the shade of the
    colour they touch, bottom and right stay ink (designer card ArtSprites)."""
    w, h = size_of(canvas)

    def filled(x, y):
        return 0 <= x < w and 0 <= y < h and canvas[y][x] not in (None, ink)
    ring = [(x, y) for y in range(h) for x in range(w)
            if canvas[y][x] is None and any(filled(x + dx, y + dy) for dx, dy in N4)]
    for x, y in ring:
        canvas[y][x] = ink
    if mode == 'selective':
        source = clone(canvas)
        for y in range(h):
            for x in range(w):
                if source[y][x] != ink:
                    continue
                right = source[y][x + 1] if x + 1 < w else None
                below = source[y + 1][x] if y + 1 < h else None
                inner = next((n for n in (right, below) if n not in (None, ink)), None)
                left = source[y][x - 1] if x > 0 else None
                above = source[y - 1][x] if y > 0 else None
                if inner and (left is None or above is None):
                    canvas[y][x] = SHADE.get(inner, inner)
    return canvas


LIGHTS = {'top-left': (-1, -1), 'top-right': (1, -1), 'top': (0, -1), 'left': (-1, 0), 'right': (1, 0)}


def shade(canvas, keys=None, depth=1, light=False, light_from='top-left'):
    """Shade the side away from the light; optionally light the side facing it."""
    w, h = size_of(canvas)
    lx, ly = LIGHTS[light_from]
    keys = set(keys) if keys else {c for row in canvas for c in row if c not in (None, 'k')}

    def form(x, y):
        return 0 <= x < w and 0 <= y < h and canvas[y][x] in keys

    def edge(x, y, sx, sy):
        return any((sx and not form(x + sx * d, y)) or (sy and not form(x, y + sy * d)) for d in range(1, depth + 1))
    result = clone(canvas)
    for y in range(h):
        for x in range(w):
            if not form(x, y):
                continue
            key = canvas[y][x]
            if edge(x, y, -lx, -ly):
                result[y][x] = SHADE.get(key, key)
            elif light and edge(x, y, lx, ly):
                result[y][x] = LIGHT.get(key, key)
    canvas[:] = result
    return canvas


# ---------------------------------------------------------------- ops (shared by packs and sprite recipes)

COORD = (-256, 512)
OPS = {
    'rect': {'x': 'int', 'y': 'int', 'w': 'pos', 'h': 'pos', 'key': 'key', 'hollow': 'bool'},
    'ellipse': {'x': 'int', 'y': 'int', 'w': 'pos', 'h': 'pos', 'key': 'key'},
    'circle': {'cx': 'int', 'cy': 'int', 'r': 'pos', 'key': 'key'},
    'line': {'x1': 'int', 'y1': 'int', 'x2': 'int', 'y2': 'int', 'key': 'key', 'width': 'pos'},
    'poly': {'points': 'points', 'key': 'key'},
    'pixels': {'at': 'points', 'key': 'key'},
    'grid': {'rows': 'rows', 'x': 'int', 'y': 'int'},
    'dither': {'x': 'int', 'y': 'int', 'w': 'pos', 'h': 'pos', 'keys': 'keypair', 'cell': 'cell'},
    'outline': {'mode': 'outline', 'key': 'key'},
    'shade': {'keys': 'keys', 'light': 'bool', 'depth': 'pos', 'from': 'light'},
    'mirror': {'axis': 'axis'},
    'swap': {'map': 'swap'},
    'scatter': {'key': 'key', 'count': 'pos', 'area': 'box', 'on': 'keys'},
    'choose': {'options': 'options'},
    'text': {'text': 'text', 'x': 'int', 'y': 'int', 'key': 'key'},
    'part': {'name': 'partname', 'x': 'int', 'y': 'int'},
}
REQUIRED = {'rect': ('x', 'y', 'w', 'h', 'key'), 'ellipse': ('x', 'y', 'w', 'h', 'key'), 'circle': ('cx', 'cy', 'r', 'key'),
            'line': ('x1', 'y1', 'x2', 'y2', 'key'), 'poly': ('points', 'key'), 'pixels': ('at', 'key'), 'grid': ('rows',),
            'dither': ('x', 'y', 'w', 'h', 'keys'), 'swap': ('map',), 'scatter': ('key', 'count'),
            'choose': ('options',), 'text': ('text', 'x', 'y', 'key'), 'part': ('name',)}


def check_ops(check, ops, path, palette=None, size=None, depth=0, parts=False):
    if not isinstance(ops, list) or len(ops) > 200:
        return check.fail(path, 'must be a list of at most 200 drawing steps')
    for i, op in enumerate(ops):
        here = f'{path}[{i}]'
        if not isinstance(op, dict) or 'op' not in op:
            check.fail(here, 'each step is an object with "op"', sorted(OPS))
            continue
        kind = op['op']
        if not check.choice(kind, f'{here}.op', sorted(o for o in OPS if parts or o != 'part')) or (kind == 'part' and not parts):
            continue
        check.fields(op, here, ['op', 'clip', *OPS[kind]], ('op', *REQUIRED.get(kind, ())))
        if 'clip' in op:
            check_value(check, op['clip'], f'{here}.clip', 'box', palette, size, depth)
        for name, kind_of in OPS[kind].items():
            if name in op:
                check_value(check, op[name], f'{here}.{name}', kind_of, palette, size, depth)
        if kind == 'dither' and size is not None and size < 32:
            check.fail(f'{here}', 'no dithering below 32 px (designer rule); use flat colour at 16')


def check_value(check, value, path, kind, palette, size, depth):
    if kind == 'int':
        check.integer(value, path, *COORD)
    elif kind == 'pos':
        check.integer(value, path, 1, LIMIT)
    elif kind == 'bool':
        if type(value) is not bool:
            check.fail(path, 'must be true or false')
    elif kind == 'key':
        if value != '.':  # '.' erases inside one drawing (cut a face opening, a hole)
            check.key(value, path, palette)
    elif kind in ('keys', 'keypair'):
        if not isinstance(value, list) or not value or len(value) > len(KEYS) or (kind == 'keypair' and len(value) != 2):
            check.fail(path, 'must be a list of two palette keys' if kind == 'keypair' else 'must be a list of palette keys')
        else:
            for j, key in enumerate(value):
                check.key(key, f'{path}[{j}]', palette)
    elif kind == 'cell':
        check.choice(value, path, [1, 2])
    elif kind == 'outline':
        check.choice(value, path, ['full', 'selective'])
    elif kind == 'light':
        check.choice(value, path, list(LIGHTS))
    elif kind == 'axis':
        check.choice(value, path, ['x', 'y'])
    elif kind == 'box':
        if not isinstance(value, list) or len(value) != 4 or any(type(v) is not int for v in value) or value[2] < 1 or value[3] < 1:
            check.fail(path, 'must be [x, y, width, height] with whole numbers')
    elif kind == 'points':
        if not isinstance(value, list) or not 1 <= len(value) <= 256 or any(
                not isinstance(p, list) or len(p) != 2 or any(type(v) is not int or not COORD[0] <= v <= COORD[1] for v in p) for p in value):
            check.fail(path, 'must be a list of [x, y] whole-number pairs')
    elif kind == 'rows':
        if not isinstance(value, list) or not 1 <= len(value) <= LIMIT or any(not isinstance(r, str) or len(r) > LIMIT for r in value):
            check.fail(path, 'must be a list of strings; each character is a palette key or . for empty')
        else:
            for j, row in enumerate(value):
                bad = sorted(set(row) - set(KEYS) - {'.'})
                if bad:
                    check.fail(f'{path}[{j}]', f'unknown characters {bad}; use palette keys or .', KEYS)
                elif palette:
                    for key in sorted(set(row) - {'.'}):
                        check.key(key, f'{path}[{j}]', palette)
    elif kind == 'swap':
        check_swap(check, value, path, palette)
    elif kind == 'text':
        glyphs = PACKS['font']['glyphs']
        if not isinstance(value, str) or not 1 <= len(value) <= 40:
            check.fail(path, 'must be text of 1–40 characters')
        else:
            bad = sorted(set(value.upper()) - set(glyphs))
            if bad:
                check.fail(path, f'characters {bad} are not in the pixel font', sorted(glyphs))
    elif kind == 'options':
        if not isinstance(value, list) or not 2 <= len(value) <= 8:
            check.fail(path, 'must be a list of 2–8 alternative step lists')
        elif depth < 2:
            for j, option in enumerate(value):
                check_ops(check, option, f'{path}[{j}]', palette, size, depth + 1)
    elif kind == 'partname':
        if not isinstance(value, str) or part_ops(value, 16) is None:
            check.fail(path, f'{json.dumps(value)} is not a library part', sorted(library_parts()), value)


def check_swap(check, value, path, palette=None):
    if not isinstance(value, dict) or len(value) > len(KEYS):
        return check.fail(path, 'must be an object of key → key, like {"r": "b", "R": "B"}')
    for source, target in value.items():
        check.key(source, f'{path}.{source}')
        check.key(target, f'{path}.{source}', palette)
    return True


def draw(canvas, ops, scale=1, offset=(0, 0), seed=None, label='part'):
    """Apply drawing steps. Geometry is in design units, multiplied by scale."""
    S, (ox, oy) = scale, offset
    for index, op in enumerate(ops):
        kind, key = op['op'], op.get('key')
        clip = op.get('clip')
        if clip:
            clip = [clip[0] * S + ox, clip[1] * S + oy, clip[2] * S, clip[3] * S]
        if kind == 'rect':
            x, y, w, h = op['x'] * S + ox, op['y'] * S + oy, op['w'] * S, op['h'] * S
            for j in range(y, y + h):
                for i in range(x, x + w):
                    if not op.get('hollow') or i in (x, x + w - 1) or j in (y, y + h - 1):
                        put(canvas, i, j, key, clip)
        elif kind in ('ellipse', 'circle'):
            if kind == 'circle':
                x, y, w, h = (op['cx'] - op['r']) * S + ox, (op['cy'] - op['r']) * S + oy, (2 * op['r'] + 1) * S, (2 * op['r'] + 1) * S
            else:
                x, y, w, h = op['x'] * S + ox, op['y'] * S + oy, op['w'] * S, op['h'] * S
            for j in range(y, y + h):
                for i in range(x, x + w):
                    if (2 * i + 1 - 2 * x - w) ** 2 * h * h + (2 * j + 1 - 2 * y - h) ** 2 * w * w <= w * w * h * h:
                        put(canvas, i, j, key, clip)
        elif kind == 'line':
            width = op.get('width', 1) * S
            for px, py in line_points(op['x1'] * S + ox, op['y1'] * S + oy, op['x2'] * S + ox, op['y2'] * S + oy):
                for j in range(width):
                    for i in range(width):
                        put(canvas, px + i, py + j, key, clip)
        elif kind == 'poly':
            points = [(px * S + ox, py * S + oy) for px, py in op['points']]
            doubled = [(2 * px, 2 * py) for px, py in points]
            xs, ys = [p[0] for p in points], [p[1] for p in points]
            for j in range(min(ys), max(ys) + 1):
                for i in range(min(xs), max(xs) + 1):
                    if inside_polygon(2 * i + 1, 2 * j + 1, doubled):
                        put(canvas, i, j, key, clip)
            for a, b in zip(points, points[1:] + points[:1]):
                for px, py in line_points(*a, *b):
                    put(canvas, px, py, key, clip)
        elif kind == 'pixels':
            for px, py in op['at']:
                for j in range(S):
                    for i in range(S):
                        put(canvas, px * S + ox + i, py * S + oy + j, key, clip)
        elif kind == 'grid':
            gx, gy = op.get('x', 0) * S + ox, op.get('y', 0) * S + oy
            for j, row in enumerate(op['rows']):
                for i, cell in enumerate(row):
                    if cell != '.':
                        for b in range(S):
                            for a in range(S):
                                put(canvas, gx + i * S + a, gy + j * S + b, cell, clip)
        elif kind == 'dither':
            x, y, w, h = op['x'] * S + ox, op['y'] * S + oy, op['w'] * S, op['h'] * S
            cell = op.get('cell', 2)
            for j in range(y, y + h):
                for i in range(x, x + w):
                    put(canvas, i, j, op['keys'][((i - x) // cell + (j - y) // cell) % 2], clip)
        elif kind == 'outline':
            outline(canvas, op.get('mode', 'full'), op.get('key', 'k'))
        elif kind == 'shade':
            shade(canvas, op.get('keys'), op.get('depth', 1) * S, op.get('light', False), op.get('from', 'top-left'))
        elif kind == 'mirror':
            w, h = size_of(canvas)
            for j in range(h):
                for i in range(w):
                    if op['axis'] == 'x' and i < w // 2:
                        canvas[j][w - 1 - i] = canvas[j][i]
                    elif op['axis'] == 'y' and j < h // 2:
                        canvas[h - 1 - j][i] = canvas[j][i]
        elif kind == 'swap':
            for row in canvas:
                for i, cell in enumerate(row):
                    if cell in op['map']:
                        row[i] = op['map'][cell]
        elif kind == 'scatter':
            w, h = size_of(canvas)
            ax, ay, aw, ah = (op['area'][0] * S + ox, op['area'][1] * S + oy, op['area'][2] * S, op['area'][3] * S) if 'area' in op else (0, 0, w, h)
            on = set(op['on']) if 'on' in op else None
            spots = [(i, j) for j in range(max(ay, 0), min(ay + ah, h)) for i in range(max(ax, 0), min(ax + aw, w))
                     if (canvas[j][i] in on if on else canvas[j][i] is None)]
            spots.sort(key=lambda p: rnd(seed or 0, f'{label}.scatter{index}', p[1] * 1000 + p[0]))
            for i, j in spots[:op['count']]:
                canvas[j][i] = key
        elif kind == 'choose':
            pick = 0 if seed is None else rnd(seed, f'{label}.choose{index}') % len(op['options'])
            draw(canvas, op['options'][pick], scale, offset, seed, f'{label}.{index}')
        elif kind == 'text':
            draw_text(canvas, op['text'], op['x'] * S + ox, op['y'] * S + oy, key, S, clip)
        elif kind == 'part':
            width, _ = size_of(canvas)
            draw(canvas, part_ops(op['name'], width) or [], scale, (op.get('x', 0) * S + ox, op.get('y', 0) * S + oy), seed, op['name'])
    return canvas


def draw_text(canvas, text, x, y, key, scale=1, clip=None):
    font = PACKS['font']
    for char in text.upper():
        rows = font['glyphs'][char]
        for j, row in enumerate(rows):
            for i, cell in enumerate(row):
                if cell != '.':
                    for b in range(scale):
                        for a in range(scale):
                            put(canvas, x + i * scale + a, y + j * scale + b, key, clip)
        x += (len(rows[0]) + font['spacing']) * scale


def text_width(text):
    font = PACKS['font']
    return sum(len(font['glyphs'][c][0]) + font['spacing'] for c in text.upper()) - font['spacing']


# ---------------------------------------------------------------- content packs

def library_parts():
    """Every reusable drawing in the packs, addressable as kind.name (for sprite recipes)."""
    names = [f'item.{n}' for n in PACKS['items']['items']] + [f'icon.{n}' for n in PACKS['icons']['icons']]
    return names


def part_ops(name, size):
    group, _, item = name.partition('.') if isinstance(name, str) else ('', '', '')
    if group == 'item' and item in PACKS['items']['items']:
        return [op for layer in PACKS['items']['items'][item]['layers'] for op in layer_ops(layer, min(size, 64))[0]]
    if group == 'icon' and item in PACKS['icons']['icons']:
        entry = PACKS['icons']['icons'][item]
        return part_ops(f'item.{entry["item"]}', 16) if 'item' in entry else entry['16']
    return None


def layer_ops(entry, size):
    """Return (ops, scale) for a part at size: exact 16 px art, or 32-unit design scaled to 32/64."""
    if size == 16:
        return entry.get('16', []), 1
    if '32' in entry:
        return entry['32'], size // 32
    return entry.get('16', []), size // 16


def swap_layer(canvas, mapping):
    if mapping:
        draw(canvas, [{'op': 'swap', 'map': mapping}])
    return canvas


def role_swap(defaults, chosen):
    """Map a part's authored keys to the recipe's keys, e.g. tunic r/R → b/B."""
    defaults = defaults if isinstance(defaults, list) else [defaults]
    chosen = chosen if isinstance(chosen, list) else [chosen]
    return {a: b for a, b in zip(defaults, chosen) if a != b}


def colour_keys(value):
    """A named colour ('blue') or explicit key list (['b', 'B'])."""
    if isinstance(value, str) and value in PALETTES['colours']:
        return PALETTES['colours'][value]
    return value


# ---------------------------------------------------------------- recipe defaults and validation

def defaults(spec):
    kind = spec.get('kind')
    base = {'schema': SCHEMA, 'kind': kind, 'palette': 'meadow', 'swap': {}, 'variants': []}
    size = spec.get('size', 16)
    if kind in ('character', 'monster', 'item'):
        base.update(size=16, outline='full' if size == 16 else 'selective')
    if kind == 'character':
        base.update(parts={'body': 'medium', 'skin': 's', 'hair': {'style': 'short', 'key': 'n'},
                           'outfit': {'style': 'tunic', 'keys': ['r', 'R']}, 'held': 'none', 'face': 'calm'},
                    frames={'idle': 2})
    elif kind == 'monster':
        base.update(parts={'body': 'blob', 'eyes': 'dots', 'colour': ['g', 'G'], 'light': 'l', 'extra': 'none'},
                    frames={'idle': 2})
    elif kind == 'item':
        base.update(keys={})
    elif kind == 'icon':
        base.update(style='pixel', size=16)
    elif kind == 'tile':
        base.update(size=16, detail='low', variants_count=1)
    elif kind == 'frame':
        base.update(style='pixel', source='frame9', width=48, height=32, slice=4, corner='cut', outline_key='k')
    elif kind == 'building':
        base.update(size=32, outline='selective', parts={'wall': 'wood', 'roof': {'style': 'gable', 'keys': ['r', 'R']},
                                                         'door': 'wood', 'windows': 2, 'chimney': False})
    elif kind == 'button':
        base.update(style='pixel', width=48, height=16, fill=['y', 'o'], states=['normal'], label='')
    elif kind == 'sprite':
        base.update(width=16, height=16, frames=[])
    result = base
    for name, value in spec.items():
        if name == 'parts' and isinstance(value, dict) and isinstance(result.get('parts'), dict):
            merged = copy.deepcopy(result['parts'])
            for part, choice in value.items():
                if isinstance(choice, dict) and isinstance(merged.get(part), dict):
                    merged[part] = {**merged[part], **copy.deepcopy(choice)}
                else:
                    merged[part] = copy.deepcopy(choice)
            result['parts'] = merged
        else:
            result[name] = copy.deepcopy(value)
    if kind == 'building' and isinstance(result.get('parts'), dict) and isinstance(result['parts'].get('roof'), dict) and 'colour' in result['parts']['roof']:
        result['parts']['roof']['keys'] = colour_keys(result['parts']['roof'].pop('colour'))
    if kind in ('character', 'monster') and isinstance(result.get('parts'), dict):
        parts = result['parts']
        if kind == 'character' and isinstance(parts.get('outfit'), dict) and 'colour' in parts['outfit']:
            parts['outfit']['keys'] = colour_keys(parts['outfit'].pop('colour'))
        if kind == 'monster':
            parts['colour'] = colour_keys(parts.get('colour'))
    if kind == 'item' and isinstance(result.get('keys'), dict):
        result['keys'] = {slot: colour_keys(v) for slot, v in result['keys'].items()}
    return result


COMMON = ['schema', 'kind', 'id', 'palette', 'swap', 'variants', 'seed', 'note']
FIELDS = {
    'character': COMMON + ['size', 'outline', 'parts', 'frames'],
    'monster': COMMON + ['size', 'outline', 'parts', 'frames'],
    'item': COMMON + ['size', 'outline', 'name', 'keys'],
    'icon': COMMON + ['style', 'size', 'name'],
    'tile': COMMON + ['size', 'name', 'detail', 'variants_count'],
    'frame': COMMON + ['style', 'source', 'width', 'height', 'fill', 'bevel', 'edge', 'slice', 'corner', 'outline_key'],
    'building': COMMON + ['size', 'outline', 'parts'],
    'button': COMMON + ['style', 'width', 'height', 'fill', 'states', 'label'],
    'sprite': COMMON + ['width', 'height', 'ops', 'frames'],
}


def validate(spec):
    check = Check()
    if not isinstance(spec, dict):
        check.fail('', 'a recipe is a JSON object, e.g. {"schema": "visual-core.pixel/1", "kind": "character", "id": "hero"}')
        check.done()
    if spec.get('schema') != SCHEMA:
        check.fail('schema', f'must be "{SCHEMA}"')
    if not check.choice(spec.get('kind'), 'kind', KINDS):
        check.done()
    if spec['kind'] == 'sprite' and 'ops' not in spec:
        check.fail('ops', 'is required for kind sprite: a list of drawing steps')
    if spec['kind'] in ('item', 'icon', 'tile') and 'name' not in spec:
        names = {'item': PACKS['items']['items'], 'icon': PACKS['icons']['icons'], 'tile': PACKS['tiles']['tiles']}[spec['kind']]
        check.fail('name', f'is required for kind {spec["kind"]}', sorted(names))
    check.done()
    result = defaults(spec)
    kind = result['kind']
    check.fields(result, '', FIELDS[kind])
    if not isinstance(result.get('id'), str) or not vc.IDENT.fullmatch(result['id']):
        check.fail('id', 'is a short name: lowercase letters, digits, _ or -, starting with a letter (max 40), e.g. "hero"')
    if not check.choice(result.get('palette'), 'palette', list(PALETTES['palettes'])):
        check.done()
    palette = result['palette']
    if 'seed' in result:
        check.integer(result['seed'], 'seed', 0, 2**32 - 1)
    if 'note' in result and (not isinstance(result['note'], str) or len(result['note']) > 200):
        check.fail('note', 'must be text up to 200 characters')
    check_swap(check, result['swap'], 'swap', palette)
    check_variants(check, result['variants'], palette)
    size = result.get('size')
    if kind in ('character', 'monster', 'item'):
        check.choice(size, 'size', list(SIZES))
        check.choice(result['outline'], 'outline', ['full', 'selective'])
    globals()[f'check_{kind}'](check, result, palette)
    check.done()
    return result


def check_variants(check, variants, palette):
    if not isinstance(variants, list) or len(variants) > 8:
        return check.fail('variants', 'must be a list of at most 8 {"name": …, "swap": {…}}')
    seen = set()
    for i, variant in enumerate(variants):
        here = f'variants[{i}]'
        if check.fields(variant, here, ['name', 'swap'], ('name', 'swap')):
            name = variant.get('name')
            if not isinstance(name, str) or not vc.IDENT.fullmatch(name) or name == 'base' or name in seen:
                check.fail(f'{here}.name', 'must be a new short lowercase name (not "base"), e.g. "blue"')
            seen.add(name)
            if 'swap' in variant:
                check_swap(check, variant['swap'], f'{here}.swap', palette)


def check_frames(check, frames, allowed):
    if not isinstance(frames, dict) or not frames:
        return check.fail('frames', 'must be an object of action → frame count, e.g. {"idle": 2, "walk": 4}')
    for action, count in frames.items():
        if check.choice(action, f'frames.{action}', allowed):
            if count != len(ACTIONS[action]):
                check.fail(f'frames.{action}', f'{action} has exactly {len(ACTIONS[action])} frames; set {len(ACTIONS[action])}')


def check_character(check, spec, palette):
    pack, parts = PACKS['characters'], spec['parts']
    if not check.fields(parts, 'parts', ['body', 'skin', 'hair', 'outfit', 'held', 'face']):
        return
    check.choice(parts.get('body'), 'parts.body', list(pack['bodies']))
    check.choice(parts.get('skin'), 'parts.skin', pack['skins'])
    hair = parts.get('hair')
    if check.fields(hair, 'parts.hair', ['style', 'key']):
        check.choice(hair.get('style'), 'parts.hair.style', list(pack['hair']))
        check.key(hair.get('key'), 'parts.hair.key', palette)
    outfit = parts.get('outfit')
    if check.fields(outfit, 'parts.outfit', ['style', 'keys', 'colour']):
        check.choice(outfit.get('style'), 'parts.outfit.style', list(pack['outfit']))
        keys = outfit.get('keys')
        if not isinstance(keys, list) or len(keys) != 2:
            check.fail('parts.outfit.keys', 'must be two keys [base, shade] like ["r", "R"], or use "colour"', list(PALETTES['colours']))
        else:
            for j, key in enumerate(keys):
                check.key(key, f'parts.outfit.keys[{j}]', palette)
    check.choice(parts.get('held'), 'parts.held', list(pack['held']))
    check.choice(parts.get('face'), 'parts.face', list(pack['face']))
    check_frames(check, spec['frames'], list(ACTIONS))
    if isinstance(spec['frames'], dict) and 'attack' in spec['frames'] and parts.get('held') == 'none':
        check.fail('frames.attack', 'attack frames swing the held item; set parts.held', [h for h in pack['held'] if h != 'none'])


def check_monster(check, spec, palette):
    pack, parts = PACKS['monsters'], spec['parts']
    if not check.fields(parts, 'parts', ['body', 'eyes', 'colour', 'light', 'extra']):
        return
    check.choice(parts.get('body'), 'parts.body', list(pack['bodies']))
    check.choice(parts.get('eyes'), 'parts.eyes', list(pack['eyes']))
    check.choice(parts.get('extra'), 'parts.extra', list(pack['extras']))
    colour = parts.get('colour')
    if not isinstance(colour, list) or len(colour) != 2:
        check.fail('parts.colour', 'must be a colour name or two keys [base, shade] like ["g", "G"]', list(PALETTES['colours']), colour)
    else:
        for j, key in enumerate(colour):
            check.key(key, f'parts.colour[{j}]', palette)
    check.key(parts.get('light'), 'parts.light', palette)
    check_frames(check, spec['frames'], list(ACTIONS))


def check_slots(check, value, slots, path, palette):
    if not check.fields(value, path, list(slots)):
        return
    for slot, keys in value.items():
        want = len(slots[slot])
        keys = keys if isinstance(keys, list) else [keys]
        if len(keys) != want:
            check.fail(f'{path}.{slot}', f'needs {want} key{"s" if want > 1 else ""} like {json.dumps(slots[slot] if want > 1 else slots[slot][0])}')
        for j, key in enumerate(keys):
            check.key(key, f'{path}.{slot}', palette)


def check_item(check, spec, palette):
    items = PACKS['items']['items']
    if check.choice(spec.get('name'), 'name', sorted(items)):
        item = items[spec['name']]
        if spec.get('size') not in item.get('sizes', SIZES):
            check.fail('size', f'{spec["name"]} is drawn at', item['sizes'])
        check_slots(check, spec['keys'], item['slots'], 'keys', palette)


def check_icon(check, spec, palette):
    check.choice(spec.get('style'), 'style', ['pixel'])
    check.choice(spec.get('size'), 'size', [16])
    check.choice(spec.get('name'), 'name', sorted(PACKS['icons']['icons']))


def check_tile(check, spec, palette):
    tiles = PACKS['tiles']['tiles']
    check.choice(spec.get('size'), 'size', [16])
    check.choice(spec.get('detail'), 'detail', ['low', 'medium', 'high'])
    check.integer(spec.get('variants_count'), 'variants_count', 1, 4)
    if check.choice(spec.get('name'), 'name', sorted(tiles)):
        if spec.get('variants_count', 1) > 1 and not tiles[spec['name']].get('scatter'):
            check.fail('variants_count', f'{spec["name"]} has one drawn layout; use 1 (it has no scattered details to vary)')
        if spec.get('detail') != 'low' and not tiles[spec['name']].get('scatter'):
            check.fail('detail', f'{spec["name"]} has fixed detail; use "low"')


def check_building(check, spec, palette):
    pack, parts = PACKS['buildings'], spec['parts']
    check.choice(spec.get('size'), 'size', [32, 64])
    check.choice(spec.get('outline'), 'outline', ['full', 'selective'])
    if not check.fields(parts, 'parts', ['wall', 'roof', 'door', 'windows', 'chimney']):
        return
    check.choice(parts.get('wall'), 'parts.wall', list(pack['walls']))
    check.choice(parts.get('door'), 'parts.door', list(pack['doors']))
    check.choice(parts.get('windows'), 'parts.windows', list(range(len(pack['windows']))))
    if type(parts.get('chimney')) is not bool:
        check.fail('parts.chimney', 'must be true or false')
    roof = parts.get('roof')
    if check.fields(roof, 'parts.roof', ['style', 'keys', 'colour']):
        check.choice(roof.get('style'), 'parts.roof.style', list(pack['roofs']))
        keys = roof.get('keys')
        if not isinstance(keys, list) or len(keys) != 2:
            check.fail('parts.roof.keys', 'must be two keys [base, shade] like ["r", "R"], or use "colour"', list(PALETTES['colours']))
        else:
            for j, key in enumerate(keys):
                check.key(key, f'parts.roof.keys[{j}]', palette)


def check_frame(check, spec, palette):
    check.choice(spec.get('style'), 'style', ['pixel'])
    check.choice(spec.get('source'), 'source', [n for n, v in PACKS['frames'].items() if isinstance(v, dict) and 'grid' in v and n != 'button9'])
    check.integer(spec.get('width'), 'width', 8, LIMIT)
    check.integer(spec.get('height'), 'height', 8, LIMIT)
    check.choice(spec.get('slice'), 'slice', [4])
    check.choice(spec.get('corner'), 'corner', ['cut'])
    if 'fill' in spec:
        check.key(spec['fill'], 'fill', palette)
    check.key(spec.get('outline_key'), 'outline_key', palette)
    if 'bevel' in spec:
        check.key(spec['bevel'], 'bevel', palette)
    if 'edge' in spec and check.fields(spec['edge'], 'edge', ['light', 'shade']):
        for name, key in spec['edge'].items():
            check.key(key, f'edge.{name}', palette)


def check_button(check, spec, palette):
    check.choice(spec.get('style'), 'style', ['pixel'])
    check.integer(spec.get('width'), 'width', 12, LIMIT)
    check.integer(spec.get('height'), 'height', 12, 64)
    fill = spec.get('fill')
    if not isinstance(fill, list) or len(fill) != 2:
        check.fail('fill', 'must be two keys [face, bottom shade] like ["y", "o"]')
    else:
        for j, key in enumerate(fill):
            check.key(key, f'fill[{j}]', palette)
    states = spec.get('states')
    if not isinstance(states, list) or not states or len(set(map(str, states))) != len(states):
        check.fail('states', 'must be a list of distinct states', STATES)
    else:
        for j, state in enumerate(states):
            check.choice(state, f'states[{j}]', STATES)
    label = spec.get('label')
    if label:
        check_value(check, label, 'label', 'text', palette, None, 0)
        if type(spec.get('width')) is int and isinstance(label, str) and not check.problems:
            room = spec['width'] - 12
            if text_width('> ' + label if 'focus' in states else label) > room:
                need = text_width('> ' + label if 'focus' in states else label) + 12
                check.fail('label', f'is too wide for width {spec["width"]}; shorten it or set width ≥ {need}')
    elif not isinstance(label, str):
        check.fail('label', 'must be text (empty for no label)')


def check_sprite(check, spec, palette):
    check.integer(spec.get('width'), 'width', 1, 64)
    check.integer(spec.get('height'), 'height', 1, 64)
    check_ops(check, spec.get('ops'), 'ops', palette, min(spec.get('width', 16), spec.get('height', 16)) if not check.problems else None, parts=True)
    frames = spec.get('frames')
    if not isinstance(frames, list) or len(frames) > 32:
        return check.fail('frames', 'must be a list of at most 32 {"id", "ms", "dx", "dy", "flip", "flash", "swap"}')
    seen = set()
    for i, frame in enumerate(frames):
        here = f'frames[{i}]'
        if not check.fields(frame, here, ['id', 'ms', 'dx', 'dy', 'flip', 'flash', 'swap'], ('id', 'ms')):
            continue
        if not isinstance(frame.get('id'), str) or not vc.IDENT.fullmatch(frame['id']) or frame['id'] in seen:
            check.fail(f'{here}.id', 'must be a new short lowercase name')
        seen.add(frame.get('id'))
        check.integer(frame.get('ms'), f'{here}.ms', 40, 2000)
        for name in ('dx', 'dy'):
            if name in frame:
                check.integer(frame[name], f'{here}.{name}', -16, 16)
        for name in ('flip', 'flash'):
            if name in frame and type(frame[name]) is not bool:
                check.fail(f'{here}.{name}', 'must be true or false')
        if 'swap' in frame:
            check_swap(check, frame['swap'], f'{here}.swap', palette)


# ---------------------------------------------------------------- frame transforms

def shift(canvas, dx, dy):
    w, h = size_of(canvas)
    out = blank(w, h)
    return composite(out, canvas, dx, dy)


def bob(canvas, dy, hip):
    """Move rows above the hip down by dy; rows pushed past the hip are dropped."""
    w, h = size_of(canvas)
    out = blank(w, h)
    for y in range(hip):
        if 0 <= y + dy < hip:
            out[y + dy] = canvas[y][:]
    return out


def delete_rows(canvas, rows):
    """Remove rows; content above slides down so feet stay on the ground line."""
    w, h = size_of(canvas)
    kept = [canvas[y] for y in range(h) if y not in rows]
    return [[None] * w for _ in range(h - len(kept))] + kept


def duplicate(canvas, rows=(), cols=()):
    """Repeat rows (content above moves up) and columns (content right moves right)."""
    w, h = size_of(canvas)
    out = []
    for y in range(h):
        out.append(canvas[y][:])
        if y in rows:
            out.append(canvas[y][:])
    out = out[len(out) - h:]
    result = []
    for row in out:
        new = []
        for x in range(w):
            new.append(row[x])
            if x in cols:
                new.append(row[x])
        result.append(new[:w])
    return result


def body_transform(canvas, rule):
    if not rule:
        return canvas
    if 'delete_rows' in rule:
        canvas = delete_rows(canvas, set(rule['delete_rows']))
    if 'dup_rows' in rule or 'dup_cols' in rule:
        canvas = duplicate(canvas, set(rule.get('dup_rows', ())), set(rule.get('dup_cols', ())))
    return canvas


def flash(canvas, key='w'):
    return [[None if c is None else key for c in row] for row in canvas]


def fade(canvas, step):
    keep = (lambda x, y: (x + y) % 2 == 0) if step == 1 else (lambda x, y: x % 2 == 0 and y % 2 == 0)
    return [[c if c is not None and keep(x, y) else None for x, c in enumerate(row)] for y, row in enumerate(canvas)]


def squash(canvas, hip):
    """Drop every other row above the hip (bottom-anchored), for the die squash."""
    rows = [y for y in range(hip - 1, -1, -2)]
    return delete_rows(canvas, set(rows[:max(1, hip // 4)]))


# ---------------------------------------------------------------- kinds

def render_character(spec, size, swap_extra=None):
    pack, parts = PACKS['characters'], spec['parts']
    seed = spec.get('seed')
    unit = size // 16
    hip = pack['hip'][str(size)] if str(size) in pack['hip'] else pack['hip']['32'] * size // 32
    rule = pack['bodies'][parts['body']].get(str(size), {})
    outfit = pack['outfit'][parts['outfit']['style']]
    outfit_swap = role_swap(pack['roles']['outfit'], parts['outfit']['keys'])
    skin_swap = role_swap(pack['roles']['skin'], parts['skin'])
    hair_swap = role_swap(pack['roles']['hair'], parts['hair']['key'])
    held = pack['held'][parts['held']]

    def layer(entry, mapping=None, label='part'):
        canvas = blank(size, size)
        ops, scale = layer_ops(entry, size)
        draw(canvas, ops, scale, seed=seed, label=label)
        return swap_layer(canvas, mapping)

    def legs(pose):
        canvas = layer(pack['legs'][pose], None, 'legs')
        if 'lower' in outfit:
            composite(canvas, layer(outfit['lower'].get(pose, outfit['lower'].get('stand', {})), outfit_swap, 'outfit'))
        return canvas

    def upper():
        canvas = layer(pack['body'], skin_swap, 'body')
        composite(canvas, layer(outfit['upper'], outfit_swap, 'outfit'))
        composite(canvas, layer(pack['head'], skin_swap, 'head'))
        composite(canvas, layer(pack['hair'][parts['hair']['style']], hair_swap, 'hair'))
        composite(canvas, layer(pack['face'][parts['face']], None, 'face'))
        return canvas

    def held_layer(pose, lift):
        if pose not in held:
            return blank(size, size)
        canvas = layer(held[pose], None, 'held')
        return body_transform(bob(canvas, lift, hip) if lift else canvas, rule)

    def assemble(pose='stand', lift=0, held_pose='rest'):
        top = upper()
        if lift:
            top = bob(top, lift, hip)
        canvas = composite(legs(pose), top)
        canvas = body_transform(canvas, rule)
        outline(canvas, spec['outline'])
        return composite(canvas, held_layer(held_pose, lift))

    frames = []
    for action in ACTIONS:
        if action not in spec['frames']:
            continue
        if action == 'idle':
            cells = [assemble(), assemble(lift=unit)]
        elif action == 'walk':
            cells = [assemble('walk1'), assemble(lift=unit), assemble('walk3'), assemble(lift=unit)]
        elif action == 'attack':
            cells = [assemble(held_pose=p) for p in ('windup', 'strike', 'recover')]
        elif action == 'hurt':
            base = assemble()
            cells = [flash(base), shift(base, 2 * unit, 0)]
        else:
            base = assemble()
            cells = [flash(base), squash(base, hip), fade(base, 1), fade(base, 2)]
        frames += [(action, i, cell) for i, cell in enumerate(cells)]
    return frames


def render_monster(spec, size):
    pack, parts = PACKS['monsters'], spec['parts']
    seed = spec.get('seed')
    unit = size // 16
    body = pack['bodies'][parts['body']]
    roles = pack['roles']
    colour_swap = role_swap([roles['base'], roles['shade'], roles['light']], [*parts['colour'], parts['light']])
    anchors = body['anchors'][str(size)] if str(size) in body['anchors'] else {
        k: [v[0] * size // 32, v[1] * size // 32] for k, v in body['anchors']['32'].items()}
    hip = anchors['ground'][1]

    def stamp(entry, anchor, mapping=None, label='part'):
        canvas = blank(size, size)
        ops, scale = layer_ops(entry, size)
        ax, ay = anchors[anchor] if anchor else (0, 0)
        draw(canvas, ops, scale, (ax, ay), seed, label)
        return swap_layer(canvas, mapping)

    extra = pack['extras'][parts['extra']]
    extra_entry = extra.get(parts['body'], extra.get('any', {}))

    def assemble(squashed=False):
        canvas = blank(size, size)
        if extra_entry.get('stage') == 'back':
            composite(canvas, stamp(extra_entry, extra['anchor'], colour_swap, 'extra'))
        composite(canvas, stamp(body, None, colour_swap, 'body'))
        composite(canvas, stamp(pack['eyes'][parts['eyes']], 'eyes', None, 'eyes'))
        if extra_entry.get('stage') == 'front':
            composite(canvas, stamp(extra_entry, extra['anchor'], colour_swap, 'extra'))
        if squashed:
            canvas = delete_rows(canvas, {anchors['squash'][1]})
        outline(canvas, spec['outline'])
        if extra_entry.get('stage') == 'post':
            target = stamp(extra_entry, extra['anchor'], colour_swap, 'extra')
            if squashed:
                target = delete_rows(target, {anchors['squash'][1]})
            composite(canvas, target)
        return canvas

    frames = []
    for action in ACTIONS:
        if action not in spec['frames']:
            continue
        base = assemble()
        if action == 'idle':
            cells = [base, assemble(True)]
        elif action == 'walk':
            cells = [base, assemble(True), shift(base, 0, -unit), assemble(True)]
        elif action == 'attack':
            cells = [assemble(True), shift(base, 2 * unit, 0), base]
        elif action == 'hurt':
            cells = [flash(base), shift(base, 2 * unit, 0)]
        else:
            cells = [flash(base), squash(base, hip), fade(base, 1), fade(base, 2)]
        frames += [(action, i, cell) for i, cell in enumerate(cells)]
    return frames


def render_item(spec, size):
    item = PACKS['items']['items'][spec['name']]
    canvas, post = blank(size, size), []
    for layer in item['layers']:
        part = blank(size, size)
        ops, scale = layer_ops(layer, size)
        draw(part, ops, scale, seed=spec.get('seed'), label=f'item.{spec["name"]}')
        slot = layer.get('slot')
        if slot and slot in spec['keys']:
            swap_layer(part, role_swap(item['slots'][slot], spec['keys'][slot]))
        if layer.get('stage') == 'post':
            post.append(part)
        else:
            composite(canvas, part)
    outline(canvas, spec['outline'])
    for part in post:
        composite(canvas, part)
    return [('item', 0, canvas)]


def render_icon(spec, size):
    canvas = draw(blank(16, 16), part_ops(f'icon.{spec["name"]}', 16))
    outline(canvas, 'full')
    return [('icon', 0, canvas)]


def render_tile(spec, size):
    tile = PACKS['tiles']['tiles'][spec['name']]
    grid = tile['grid']
    base = tile.get('base')
    cells = []
    clusters = tile_clusters(grid, base) if tile.get('scatter') else []
    extra = {'low': 0, 'medium': len(clusters) // 2, 'high': len(clusters)}[spec['detail']]
    seed = spec.get('seed', 0)
    for v in range(spec['variants_count']):
        canvas = [[c for c in row] for row in grid] if v == 0 else [[base] * 16 for _ in range(16)]
        stamps = [] if v == 0 else list(clusters)
        stamps += [clusters[rnd(seed, f'tile.extra{v}', i) % len(clusters)] for i in range(extra)] if clusters else []
        taken = set()
        for i, cluster in enumerate(stamps):
            for attempt in range(64):  # first free spot (with a 1 px gap) in a seeded order
                dx, dy = rnd(seed, f'tile.v{v}.x', i * 64 + attempt) % 16, rnd(seed, f'tile.v{v}.y', i * 64 + attempt) % 16
                spot = {((x + dx) % 16, (y + dy) % 16) for x, y, _ in cluster}
                halo = {((x + a) % 16, (y + b) % 16) for x, y in spot for a in (-1, 0, 1) for b in (-1, 0, 1)}
                if not halo & taken:
                    break
            taken |= spot
            for x, y, key in cluster:
                canvas[(y + dy) % 16][(x + dx) % 16] = key
        cells.append(('tile', v, canvas))
    return cells


def tile_clusters(grid, base):
    """Connected groups of detail pixels in a drawn tile; variants move them (wrapping)."""
    seen, clusters = set(), []
    for y in range(16):
        for x in range(16):
            if grid[y][x] == base or (x, y) in seen:
                continue
            stack, cluster = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                cluster.append((cx, cy, grid[cy][cx]))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = (cx + dx) % 16, (cy + dy) % 16
                        if (nx, ny) not in seen and grid[ny][nx] != base:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            ox, oy = min(c[0] for c in cluster), min(c[1] for c in cluster)
            clusters.append(sorted((cx - ox, cy - oy, k) for cx, cy, k in cluster))
    return clusters


def nine_slice(source, width, height, corner=4):
    n = len(source)
    canvas = blank(width, height)
    for j in range(height):
        sj = j if j < corner else (n - (height - j) if j >= height - corner else corner + (j - corner) % (n - 2 * corner))
        for i in range(width):
            si = i if i < corner else (n - (width - i) if i >= width - corner else corner + (i - corner) % (n - 2 * corner))
            cell = source[sj][si]
            if cell != '.':
                canvas[j][i] = cell
    return canvas


def render_frame(spec, size):
    source = PACKS['frames'][spec['source']]
    roles = source['roles']
    mapping = {roles['outline']: spec['outline_key']}
    if 'fill' in spec:
        mapping[roles['fill']] = spec['fill']
        if 'bevel' in roles:
            fill = spec['fill']
            mapping[roles['bevel']] = 'd' if fill == 'w' else ('q' if fill == 'p' else SHADE.get(fill, fill))
    if 'bevel' in spec and 'bevel' in roles:
        mapping[roles['bevel']] = spec['bevel']
    for name, key in spec.get('edge', {}).items():
        if name in roles:
            mapping[roles[name]] = key
    canvas = nine_slice([''.join(mapping.get(c, c) if c != '.' else '.' for c in row) for row in source['grid']],
                        spec['width'], spec['height'])
    return [('frame', 0, canvas)]


def render_button(spec, size):
    pack = PACKS['frames']['button9']
    face, low = spec['fill']
    cells = []
    for state in spec['states']:
        roles = dict(pack['roles'])
        mapping = {roles['face']: face, roles['shade']: low, roles['light']: 'w', roles['outline']: 'k'}
        text_key = 'k'
        if state == 'pressed':
            mapping.update({roles['shade']: face, roles['light']: face})
        elif state == 'disabled':
            mapping.update({roles['face']: 'q', roles['shade']: 'p', roles['light']: 'q'})
            text_key = 'd'
        grid = [''.join(mapping.get(c, c) if c != '.' else '.' for c in row) for row in pack['grid']]
        canvas = nine_slice(grid, spec['width'], spec['height'])
        if state == 'focus':
            for i in range(2, spec['width'] - 2):
                canvas[1][i] = 'w'
            for j in range(2, spec['height'] - 4):
                canvas[j][1] = 'w'
        label = spec['label']
        if label:
            text = ('> ' + label) if state == 'focus' else label
            tw = text_width(text)
            x = (spec['width'] - tw) // 2
            y = 2 + (spec['height'] - 6 - PACKS['font']['height']) // 2 + (1 if state == 'pressed' else 0)
            draw_text(canvas, text, x, y, text_key)
        if state == 'pressed':
            canvas = shift(canvas, 0, 1)
        cells.append(('button', STATES.index(state), canvas, state))
    return cells


def render_building(spec, size):
    pack, parts = PACKS['buildings'], spec['parts']
    scale = size // 32

    def layer(ops, mapping=None):
        canvas = draw(blank(size, size), ops, scale, seed=spec.get('seed'), label='building')
        return swap_layer(canvas, mapping)
    canvas = blank(size, size)
    if parts['chimney']:
        composite(canvas, layer(pack['chimney']))
    composite(canvas, layer(pack['walls'][parts['wall']]))
    composite(canvas, layer(pack['roofs'][parts['roof']['style']], role_swap(pack['roles']['roof'], parts['roof']['keys'])))
    composite(canvas, layer(pack['doors'][parts['door']]))
    composite(canvas, layer(pack['windows'][parts['windows']]))
    outline(canvas, spec['outline'])
    return [('building', 0, canvas)]


def render_sprite(spec, size):
    canvas = draw(blank(spec['width'], spec['height']), spec['ops'], seed=spec.get('seed'), label='sprite')
    if not spec['frames']:
        return [('sprite', 0, canvas)]
    cells = []
    for i, frame in enumerate(spec['frames']):
        cell = shift(canvas, frame.get('dx', 0), frame.get('dy', 0))
        if frame.get('flip'):
            cell = [row[::-1] for row in cell]
        if frame.get('swap'):
            swap_layer(cell, frame['swap'])
        if frame.get('flash'):
            cell = flash(cell)
        cells.append(('sprite', i, cell, frame['id'], frame['ms']))
    return cells


def cells_for(spec):
    kind = spec['kind']
    size = spec.get('size', 16)
    return globals()[f'render_{kind}'](spec, size)


# ---------------------------------------------------------------- sheets, manifest and files

def rgba(canvas, palette, mapping=None):
    w, h = size_of(canvas)
    out = bytearray(w * h * 4)
    for y, row in enumerate(canvas):
        for x, key in enumerate(row):
            if key is None:
                continue
            key = mapping.get(key, key) if mapping else key
            value = resolve_key(palette, key)
            out[(y * w + x) * 4:(y * w + x) * 4 + 4] = bytes.fromhex(value[1:]) + b'\xff'
    return bytes(out)


def layout(spec, cells):
    """Rows = actions (or states), columns = frames; returns frame records and sheet size."""
    rows, records = [], []
    for cell in cells:
        group = cell[0]
        if not rows or rows[-1][0] != group:
            rows.append((group, []))
        rows[-1][1].append(cell)
    cw = max(size_of(c[2])[0] for c in cells)
    ch = max(size_of(c[2])[1] for c in cells)
    columns = max(len(r[1]) for r in rows)
    if spec['kind'] in ('tile', 'button'):
        rows, columns = [(rows[0][0], [c for r in rows for c in r[1]])], len(cells)
    for j, (group, row) in enumerate(rows):
        for i, cell in enumerate(row):
            kind = spec['kind']
            if kind in ('character', 'monster'):
                fid, ms = f'{group}-{cell[1]}', ACTIONS[group][cell[1]]
            elif kind == 'button':
                fid, ms = cell[3], None
            elif kind == 'sprite' and len(cell) > 3:
                fid, ms = cell[3], cell[4]
            elif kind == 'tile':
                fid, ms = f'variant-{cell[1]}', None
            else:
                fid, ms = spec['id'], None
            record = {'id': fid, 'x': i * cw, 'y': j * ch, 'w': cw, 'h': ch}
            if kind in ('character', 'monster'):
                record.update(action=group, index=cell[1])
            if ms:
                record['ms'] = ms
            if kind in ('character', 'monster', 'item', 'building', 'sprite'):
                record['pivot'] = {'x': cw // 2, 'y': ch}
            records.append((record, cell[2]))
    return records, columns * cw, len(rows) * ch


def sheet(records, width, height):
    canvas = blank(width, height)
    for record, cell in records:
        composite(canvas, cell, record['x'], record['y'])
    return canvas


def preview(canvases, palette, scale):
    """Every sheet at an integer scale on paper and on the dark panel, stacked."""
    grounds = [resolve_key(palette, 'w'), resolve_key(palette, 'p') or resolve_key(palette, 'q')]
    w = max(size_of(c)[0] for c in canvases) * scale + 16
    blocks = []
    for ground in grounds:
        for canvas in canvases:
            blocks.append((ground, canvas))
    h = sum(size_of(c)[1] * scale + 16 for _, c in blocks)
    out = bytearray(w * h * 4)
    y0 = 0
    for ground, canvas in blocks:
        cw, ch = size_of(canvas)
        bh = ch * scale + 16
        g = bytes.fromhex(ground[1:]) + b'\xff'
        for y in range(y0, y0 + bh):
            out[y * w * 4:(y + 1) * w * 4] = g * w
        for y in range(ch):
            for x in range(cw):
                key = canvas[y][x]
                if key is None:
                    continue
                c = bytes.fromhex(resolve_key(palette, key)[1:]) + b'\xff'
                for b in range(scale):
                    row = (y0 + 8 + y * scale + b) * w
                    for a in range(scale):
                        p = (row + 8 + x * scale + a) * 4
                        out[p:p + 4] = c
        y0 += bh
    return w, h, bytes(out)


def quality(spec, canvases, palette):
    """Automated gates from the designer's reference card; not an aesthetic review."""
    allowed = set(PALETTES['palettes'][palette]['colors'].values())
    used = set()
    for canvas in canvases:
        for row in canvas:
            for key in row:
                if key is not None:
                    used.add(resolve_key(palette, key))
    checks = {'palette_only': used <= allowed, 'colours_used': len(used)}
    if spec['kind'] in ('character', 'monster', 'item', 'icon', 'building'):
        base = canvases[0]
        w, h = size_of(base)
        checks['fits_canvas'] = all(base[y][x] is None for y in range(h) for x in range(w) if x in (0, w - 1) and y in (0, h - 1)) or spec['kind'] == 'icon'
        checks['has_outline'] = any(key in ('k',) or key in SHADE.values() for row in base for key in row if key)
    if spec['kind'] == 'tile':
        tile = PACKS['tiles']['tiles'][spec['name']]
        base_key = tile.get('base')
        for i, canvas in enumerate(canvases[:1]):
            detail = sum(1 for row in canvas for key in row if key != base_key) / 256
            checks['detail_ratio'] = round(detail, 3)
        checks['seamless'] = 'wrap-placed details on a flat ground' if tile.get('scatter') else 'drawn to repeat'
    checks['passed'] = checks['palette_only'] and checks.get('fits_canvas', True)
    return checks


def render(spec, folder, previous=None):
    spec = validate(spec)
    folder = Path(folder)
    palette = spec['palette']
    cells = cells_for(spec)
    if spec['swap']:
        cells = [(c[0], c[1], swap_layer(clone(c[2]), spec['swap']), *c[3:]) for c in cells]
    records, width, height = layout(spec, cells)
    base = sheet(records, width, height)
    sheets = [('base', 'sheet.png', base, {})]
    for variant in spec['variants']:
        sheets.append((variant['name'], f'sheet-{variant["name"]}.png', base, variant['swap']))
    canvases, pixel_sha = [], {}
    for name, filename, canvas, mapping in sheets:
        swapped = swap_layer(clone(canvas), mapping)
        canvases.append(swapped)
        data = rgba(swapped, palette)
        (folder/filename).write_bytes(vc.png(width, height, data))
        pixel_sha[filename] = hashlib.sha256(data).hexdigest()
    gates = quality(spec, canvases, palette)
    if not gates['passed']:
        raise ValueError('Quality gate failed: ' + json.dumps(gates))
    scale = max(1, min(8, 512 // max(width, height)))
    pw, ph, pdata = preview(canvases, palette, scale)
    (folder/'preview.png').write_bytes(vc.png(pw, ph, pdata))
    vc.write_json(folder/'spec.json', spec)
    frames = [record for record, _ in records]
    manifest = {
        'schema': 'visual-core.pixel-manifest/1', 'version': vc.VERSION, 'source': 'spec.json', 'kind': spec['kind'],
        'palette': {'name': palette, 'colors': {k: resolve_key(palette, k) for k in KEYS if resolve_key(palette, k)}},
        'sheets': {name: filename for name, filename, _, _ in sheets}, 'width': width, 'height': height,
        'frames': frames, 'preview': {'image': 'preview.png', 'scale': scale, 'grounds': ['w', 'p']},
        'filter': 'nearest', 'scale_rule': 'whole numbers only', 'pixel_sha256': pixel_sha, 'quality': gates,
        'visual_review': 'not-performed'}
    vc.write_json(folder/'manifest.json', manifest)
    body = (f'<h2>Sheets at {scale}× on paper and panel</h2><img src="preview.png" alt="All frames of {html.escape(spec["id"])} enlarged {scale} times" '
            f'width="{pw}" height="{ph}"><h2>Native scale</h2>' + ''.join(
                f'<p>{html.escape(n)}: <img src="{f}" alt="{html.escape(n)} sheet at native scale" width="{width}" height="{height}"></p>' for n, f, _, _ in sheets)
            + '<p>Frame rectangles, names and timings: <a href="manifest.json">manifest.json</a>. Editable source: <a href="spec.json">spec.json</a>.</p>')
    (folder/'preview.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                                      '<title>Pixel preview</title><style>body{font:16px system-ui;background:#f6f3eb;color:#172f36;max-width:960px;margin:40px auto;padding:16px}'
                                      'img{image-rendering:pixelated;max-width:100%}</style><h1>' + html.escape(spec['id']) + '</h1>' + body + '</html>')
    return {'frames': len(frames), 'width': width, 'height': height, 'sheets': len(sheets), 'quality': gates}


# ---------------------------------------------------------------- revisions, catalog and CLI

def merge(base, change):
    """Deep merge: objects merge, everything else replaces; null removes (back to default)."""
    result = copy.deepcopy(base)
    for name, value in change.items():
        if value is None:
            result.pop(name, None)
        elif isinstance(value, dict) and isinstance(result.get(name), dict) and name not in ('swap', 'map'):
            result[name] = merge(result[name], value)
        else:
            result[name] = copy.deepcopy(value)
    return result


def patch(spec, change):
    check = Check()
    check.fields(change, 'patch', ['set'], ('set',))
    updates = change.get('set') if isinstance(change, dict) else None
    if isinstance(updates, dict):
        for fixed in ('schema', 'kind', 'id'):
            if fixed in updates and updates[fixed] != spec.get(fixed):
                check.fail(f'patch.set.{fixed}', 'cannot change in a revision; create a new asset instead')
    elif isinstance(change, dict) and 'set' in change:
        check.fail('patch.set', 'must be an object of fields to change, e.g. {"set": {"size": 32}}')
    check.done()
    candidate = merge(spec, updates)
    if 'size' in updates and 'outline' not in updates and spec['kind'] in ('character', 'monster', 'item'):  # buildings stay as set
        if spec.get('outline') == ('full' if spec.get('size') == 16 else 'selective'):
            candidate['outline'] = 'full' if updates['size'] == 16 else 'selective'
    return validate(candidate)


def catalog():
    chars, mons = PACKS['characters'], PACKS['monsters']
    return {
        'schema': SCHEMA, 'kinds': list(KINDS), 'sizes': list(SIZES),
        'palettes': {n: {'use': p['use'], 'keys': sorted(p['colors']), 'fallback': p['fallback']} for n, p in PALETTES['palettes'].items()},
        'keys': PALETTES['names'], 'colours': PALETTES['colours'],
        'actions': {a: {'frames': len(ms), 'ms': ms} for a, ms in ACTIONS.items()},
        'character': {'body': list(chars['bodies']), 'skin': chars['skins'], 'hair.style': list(chars['hair']),
                      'outfit.style': list(chars['outfit']), 'held': list(chars['held']), 'face': list(chars['face'])},
        'monster': {'body': list(mons['bodies']), 'eyes': list(mons['eyes']), 'extra': list(mons['extras'])},
        'items': {n: {'slots': i['slots'], 'sizes': i.get('sizes', list(SIZES))} for n, i in PACKS['items']['items'].items()},
        'icons': list(PACKS['icons']['icons']), 'tiles': {n: {'variants': bool(t.get('scatter'))} for n, t in PACKS['tiles']['tiles'].items()},
        'buildings': {'wall': list(PACKS['buildings']['walls']), 'roof.style': list(PACKS['buildings']['roofs']),
                      'door': list(PACKS['buildings']['doors']), 'windows': list(range(len(PACKS['buildings']['windows']))), 'chimney': [False, True], 'sizes': [32, 64]},
        'frame_sources': [n for n, v in PACKS['frames'].items() if isinstance(v, dict) and 'grid' in v and n != 'button9'],
        'button_states': list(STATES), 'ops': {k: sorted(v) for k, v in OPS.items()},
        'templates': sorted(p.stem for p in (vc.ROOT/'presets/pixel').glob('*.json')),
        'library_templates': library_templates(),
        'outputs': ['sheet.png', 'sheet-<variant>.png', 'preview.png', 'manifest.json', 'spec.json', 'preview.html'],
    }


def palette_info(name, ui=None):
    check = Check()
    check.choice(name, 'palette', list(PALETTES['palettes']))
    check.done()
    entry = PALETTES['palettes'][name]
    roles = dict(entry['ui'])
    if ui:
        check.fields(ui, 'ui', list(roles))
        for role, key in ui.items():
            check.key(key, f'ui.{role}', name)
        check.done()
        roles.update(ui)
    css = {role: resolve_key(name, key) for role, key in roles.items()}
    pairs = {'text on panel': ('--g-text', '--g-panel'), 'dim on panel': ('--g-dim', '--g-panel'),
             'ink on paper': ('--g-ink', '--g-paper'), 'ink on accent': ('--g-ink', '--g-accent')}
    ratios = {label: round(vc.contrast(css[a], css[b]), 2) for label, (a, b) in pairs.items()}
    weak = [label for label, ratio in ratios.items() if ratio < 4.5]
    if ui and weak:
        raise RecipeError([{'path': 'ui', 'problem': f'text pairs below 4.5:1: {weak}', 'message': f'ui: text pairs below 4.5:1: {", ".join(weak)}; choose another key'}])
    return {'palette': name, 'colors': {k: resolve_key(name, k) for k in KEYS if resolve_key(name, k)},
            'fallback': entry['fallback'], 'ui': roles, 'css': css, 'contrast': ratios,
            'style': 'style="' + '; '.join(f'{r}: {v}' for r, v in css.items()) + '"'}


def load(path):
    import terrain  # strict JSON: size limit, duplicate keys and NaN refused
    return terrain.load(path)


def library_templates():
    """Every content-library entry is also a ready recipe: item.gem, icon.gear, tile.water, frame.parchment…"""
    frames = [n for n, v in PACKS['frames'].items() if isinstance(v, dict) and 'grid' in v and n != 'button9']
    return ([f'item.{n}' for n in PACKS['items']['items']] + [f'icon.{n}' for n in PACKS['icons']['icons']]
            + [f'tile.{n}' for n in PACKS['tiles']['tiles']] + [f'frame.{n}' for n in frames]
            + [f'building.{w}-{r}' for w in PACKS['buildings']['walls'] for r in PACKS['buildings']['roofs']])


def library_recipe(name):
    group, _, item = name.partition('.')
    base = {'schema': SCHEMA, 'id': item.replace('_', '-')}
    if group == 'item':
        return {**base, 'kind': 'item', 'name': item, 'size': 16, 'keys': {s: (k if len(k) > 1 else k[0]) for s, k in PACKS['items']['items'][item]['slots'].items()}}
    if group == 'icon':
        return {**base, 'kind': 'icon', 'style': 'pixel', 'size': 16, 'name': item}
    if group == 'tile':
        scatter = PACKS['tiles']['tiles'][item].get('scatter')
        return {**base, 'kind': 'tile', 'name': item, 'detail': 'low', 'variants_count': 4 if scatter else 1, **({'seed': 1} if scatter else {})}
    if group == 'frame':
        return {**base, 'id': f'{item}-frame', 'kind': 'frame', 'style': 'pixel', 'source': item, 'width': 48, 'height': 32}
    wall, _, roof = item.partition('-')
    return {**base, 'kind': 'building', 'size': 32, 'parts': {'wall': wall, 'roof': {'style': roof, 'keys': ['r', 'R']}, 'door': 'wood',
                                                              'windows': 2, 'chimney': roof in ('gable', 'hip')}}


def template(name):
    check = Check()
    names = sorted(p.stem for p in (vc.ROOT/'presets/pixel').glob('*.json'))
    check.choice(name, 'template', names + library_templates())
    check.done()
    if name in names:
        return load(vc.ROOT/'presets/pixel'/f'{name}.json')
    return library_recipe(name)


def main(argv):
    import argparse
    parser = argparse.ArgumentParser(prog='visual.py pixel', description=__doc__)
    actions = parser.add_subparsers(dest='action', required=True)
    actions.add_parser('catalog')
    p = actions.add_parser('template'); p.add_argument('name')
    p = actions.add_parser('palette'); p.add_argument('name'); p.add_argument('--ui', help='JSON like {"--g-accent": "g"}')
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
        elif args.action == 'palette':
            result = palette_info(args.name, json.loads(args.ui) if args.ui else None)
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
