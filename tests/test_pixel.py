import copy
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
import pixel
import visual_core as vc

DESIGNER = json.loads((ROOT / 'tests/fixtures/designer_art_reference.json').read_text())
SPR = DESIGNER['sprites']


def recipe(**fields):
    return {'schema': pixel.SCHEMA, 'id': 'x', **fields}


def rows(canvas):
    return [''.join(key or '.' for key in row) for row in canvas]


def frames(spec):
    return {(c[0], c[1]): rows(c[2]) for c in pixel.cells_for(pixel.validate(spec))}


def decode(path):
    raw = path.read_bytes()
    assert raw[:8] == b'\x89PNG\r\n\x1a\n'
    width, height = struct.unpack('!II', raw[16:24])
    offset, compressed = 8, b''
    while offset < len(raw):
        length = struct.unpack('!I', raw[offset:offset + 4])[0]
        kind, payload = raw[offset + 4:offset + 8], raw[offset + 8:offset + 8 + length]
        assert struct.unpack('!I', raw[offset + 8 + length:offset + 12 + length])[0] == zlib.crc32(kind + payload) & 0xffffffff
        if kind == b'IDAT':
            compressed += payload
        offset += length + 12
    scan = zlib.decompress(compressed)
    stride = width * 4 + 1
    return width, height, b''.join(scan[y * stride + 1:(y + 1) * stride] for y in range(height))


def designer_hero(legs=None, lift=0):
    grid = list(SPR['hero'])
    if legs:
        grid[12:16] = DESIGNER['walk_legs'][legs]
    if lift:
        grid = ['.' * 16] + grid[:11] + grid[12:]
    return grid


def designer_sword(frame):
    grid = [list(r) for r in SPR['hero']]
    for x, y, key in DESIGNER['sword_pixels'][str(frame)]:
        grid[y][x] = key
    return [''.join(r) for r in grid]


class DesignerReference(unittest.TestCase):
    """The recipes in presets/pixel reproduce the designer's reference set pixel for pixel."""

    def test_hero_and_its_animation_frames(self):
        plain = frames(recipe(kind='character', frames={'idle': 2, 'walk': 4, 'hurt': 2}))
        self.assertEqual(plain[('idle', 0)], SPR['hero'])
        self.assertEqual(plain[('idle', 1)], designer_hero(lift=1))
        self.assertEqual([plain[('walk', i)] for i in range(4)],
                         [designer_hero('W1'), designer_hero(lift=1), designer_hero('W3'), designer_hero(lift=1)])
        self.assertEqual(plain[('hurt', 0)], [''.join('.' if c == '.' else 'w' for c in r) for r in SPR['hero']])
        self.assertEqual(plain[('hurt', 1)], ['..' + r[:14] for r in SPR['hero']])
        armed = frames(recipe(kind='character', parts={'held': 'sword'}, frames={'attack': 3}))
        self.assertEqual([armed[('attack', i)] for i in range(3)], [designer_sword(i) for i in range(3)])

    def test_monster_item_icon_tile_and_frames(self):
        self.assertEqual(frames(recipe(kind='monster'))[('idle', 0)], SPR['slime'])
        crowned = list(SPR['slime'])
        for row, text in DESIGNER['crown_rows'].items():
            crowned[int(row)] = text
        self.assertEqual(frames(recipe(kind='monster', parts={'extra': 'crown'}))[('idle', 0)], crowned)
        self.assertEqual(frames(recipe(kind='item', name='potion'))[('item', 0)], SPR['potion'])
        self.assertEqual(frames(recipe(kind='item', name='coin'))[('item', 0)], SPR['coin'])
        self.assertEqual(frames(recipe(kind='icon', name='heart'))[('icon', 0)], SPR['heart'])
        self.assertEqual(frames(recipe(kind='tile', name='grass'))[('tile', 0)], SPR['grass'])
        self.assertEqual(frames(recipe(kind='frame', width=12, height=12))[('frame', 0)], SPR['frame9'])
        self.assertEqual(frames(recipe(kind='button', width=12, height=12, label=''))[('button', 0)], SPR['button9'])
        # A stretched 9-slice keeps the corners and repeats the edges (designer's nine()).
        wide = frames(recipe(kind='frame', width=30, height=20))[('frame', 0)]
        self.assertEqual([r[:4] + r[-4:] for r in wide[:4]], [r[:4] + r[-4:] for r in SPR['frame9'][:4]])
        self.assertTrue(all(len(r) == 30 for r in wide) and len(wide) == 20)

    def test_presets_are_the_reference_recipes(self):
        hero = pixel.template('hero')
        self.assertEqual(hero['parts']['hair'], {'style': 'short', 'key': 'n'})
        for name in pixel.catalog()['templates']:
            with self.subTest(name=name):
                pixel.validate(pixel.template(name))


class Determinism(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def test_every_template_is_byte_identical_across_runs(self):
        for name in pixel.catalog()['templates']:
            with self.subTest(name=name):
                a = Path(vc.publish(self.root / f'{name}-a', pixel.template(name))['directory'])
                b = Path(vc.publish(self.root / f'{name}-b', pixel.template(name))['directory'])
                files = sorted(p.name for p in a.iterdir())
                self.assertEqual(files, sorted(p.name for p in b.iterdir()))
                for file in files:
                    self.assertEqual((a / file).read_bytes(), (b / file).read_bytes(), file)

    def test_reference_pixels_are_stable_across_machines(self):
        # Pixel (RGBA) hashes do not depend on the zlib build, unlike PNG bytes.
        for name in GOLDEN:
            spec = pixel.validate(pixel.template(name))
            cells = pixel.cells_for(spec)
            records, w, h = pixel.layout(spec, cells)
            digest = hashlib.sha256(pixel.rgba(pixel.sheet(records, w, h), spec['palette'])).hexdigest()[:16]
            with self.subTest(name=name):
                self.assertEqual(digest, GOLDEN[name])

    def test_png_decodes_to_the_palette_colours_of_the_grid(self):
        result = vc.publish(self.root / 'hero', pixel.template('hero'))
        folder = Path(result['directory'])
        manifest = vc.load(folder / 'manifest.json')
        width, height, data = decode(folder / 'sheet.png')
        self.assertEqual((width, height), (manifest['width'], manifest['height']))
        self.assertEqual(hashlib.sha256(data).hexdigest(), manifest['pixel_sha256']['sheet.png'])
        idle = next(f for f in manifest['frames'] if f['id'] == 'idle-0')
        colors = manifest['palette']['colors']
        expected_rows = frames(pixel.template('hero'))[('idle', 0)]
        self.assertEqual([r[:13] for r in expected_rows], [r[:13] for r in SPR['hero']])
        for y, row in enumerate(expected_rows):
            for x, key in enumerate(row):
                pos = ((idle['y'] + y) * width + idle['x'] + x) * 4
                expected = b'\0' * 4 if key == '.' else bytes.fromhex(colors[key][1:]) + b'\xff'
                self.assertEqual(data[pos:pos + 4], expected)
        allowed = {bytes.fromhex(c[1:]) + b'\xff' for c in colors.values()} | {b'\0' * 4}
        self.assertLessEqual({data[i:i + 4] for i in range(0, len(data), 4)}, allowed)
        blue = decode(folder / 'sheet-blue.png')[2]
        self.assertNotEqual(blue, data)
        self.assertEqual(len(blue), len(data))

    def test_manifest_rectangles_names_and_timings(self):
        folder = Path(vc.publish(self.root / 'hero', pixel.template('hero'))['directory'])
        manifest = vc.load(folder / 'manifest.json')
        self.assertEqual(manifest['sheets'], {'base': 'sheet.png', 'blue': 'sheet-blue.png'})
        self.assertEqual(manifest['visual_review'], 'not-performed')
        ids = [f['id'] for f in manifest['frames']]
        self.assertEqual(len(ids), len(set(ids)))
        for frame in manifest['frames']:
            self.assertLessEqual(frame['x'] + frame['w'], manifest['width'])
            self.assertLessEqual(frame['y'] + frame['h'], manifest['height'])
            self.assertEqual(frame['ms'], pixel.ACTIONS[frame['action']][frame['index']])
            self.assertEqual(frame['pivot'], {'x': 8, 'y': 16})
        self.assertEqual([f['id'] for f in manifest['frames'] if f['action'] == 'attack'], ['attack-0', 'attack-1', 'attack-2'])
        # rows are actions, columns are frames
        self.assertEqual({f['y'] for f in manifest['frames'] if f['action'] == 'walk'}, {16})

    def test_seed_variation_is_repeatable(self):
        def tiles(seed):
            return [rows(c[2]) for c in pixel.cells_for(pixel.validate(recipe(kind='tile', name='grass', variants_count=4, seed=seed)))]
        self.assertEqual(tiles(5), tiles(5))
        self.assertNotEqual(tiles(5), tiles(6))
        self.assertEqual(tiles(5)[0], SPR['grass'])
        for grid in tiles(5):
            detail = sum(c != 'g' for r in grid for c in r)
            self.assertEqual(detail, sum(c != 'g' for r in SPR['grass'] for c in r))
            self.assertLess(detail / 256, 0.15)
        hair = {tuple(rows(c[2])) for s in range(12) for c in pixel.cells_for(pixel.validate(recipe(kind='character', seed=s)))[:1]}
        self.assertGreater(len(hair), 1)


class Coverage(unittest.TestCase):
    def test_every_named_choice_renders_at_every_size_and_palette(self):
        catalog = pixel.catalog()
        chars, mons = catalog['character'], catalog['monster']
        options = [('body', v) for v in chars['body']] + [('skin', v) for v in chars['skin']] + \
                  [('hair', {'style': v}) for v in chars['hair.style']] + [('outfit', {'style': v}) for v in chars['outfit.style']] + \
                  [('held', v) for v in chars['held'] if v != 'none'] + [('face', v) for v in chars['face']]
        for size in pixel.SIZES:
            for part, value in options:
                frames_wanted = {'idle': 2, 'walk': 4, 'attack': 3, 'hurt': 2, 'die': 4} if part == 'held' else {'idle': 2, 'walk': 4}
                spec = pixel.validate(recipe(kind='character', size=size, parts={part: value}, frames=frames_wanted))
                cells = pixel.cells_for(spec)
                with self.subTest(size=size, part=part, value=value):
                    self.assertEqual(len(cells), sum(frames_wanted.values()))
                    self.assertTrue(all(pixel.size_of(c[2]) == (size, size) for c in cells))
                    self.assertTrue(pixel.quality(spec, [cells[0][2]], 'meadow')['passed'])
            for body in mons['body']:
                for eyes, extra in zip(mons['eyes'] * 2, mons['extra'] + ['none'] * 4):
                    spec = pixel.validate(recipe(kind='monster', size=size, parts={'body': body, 'eyes': eyes, 'extra': extra},
                                                 frames={'idle': 2, 'walk': 4, 'attack': 3, 'hurt': 2, 'die': 4}))
                    cells = pixel.cells_for(spec)
                    with self.subTest(size=size, body=body, eyes=eyes, extra=extra):
                        self.assertEqual(len(cells), 15)
                        self.assertTrue(pixel.quality(spec, [cells[0][2]], 'meadow')['passed'])
        for name, item in catalog['items'].items():
            for size in item['sizes']:
                pixel.cells_for(pixel.validate(recipe(kind='item', name=name, size=size)))
        for palette in pixel.PALETTES['palettes']:
            for name in catalog['templates']:
                spec = pixel.validate({**pixel.template(name), 'palette': palette, 'variants': []})
                with self.subTest(palette=palette, template=name):
                    used = pixel.quality(spec, [pixel.sheet(*pixel.layout(spec, pixel.cells_for(spec)))], palette)
                    self.assertTrue(used['palette_only'])

    def test_pack_drawings_pass_the_same_validation_as_recipes(self):
        def walk(value, path):
            if isinstance(value, dict):
                for key, child in value.items():
                    if key in ('16', '32') and isinstance(child, list):
                        check = pixel.Check()
                        pixel.check_ops(check, child, f'{path}.{key}')
                        self.assertEqual(check.problems, [], path)
                    else:
                        walk(child, f'{path}.{key}')
        for name, pack in pixel.PACKS.items():
            walk(pack, name)
        for name, tile in pixel.PACKS['tiles']['tiles'].items():
            self.assertTrue(len(tile['grid']) == 16 and all(len(r) == 16 for r in tile['grid']), name)


class Revisions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.asset = Path(self.temp.name).resolve() / 'sword'

    def cli(self, *args, success=True):
        result = subprocess.run([sys.executable, str(ROOT / 'tools/visual.py'), 'pixel', *map(str, args)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0 if success else 1, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def test_same_sword_blue_bigger_then_noop_then_stale(self):
        vc.publish(self.asset, pixel.template('sword'))
        first = {p.name: p.read_bytes() for p in (self.asset / '0001').iterdir()}
        change = {'set': {'size': 32, 'keys': {'blade': ['b', 'B']}}}
        result = vc.publish(self.asset, base=1, patch=change)
        self.assertEqual(result['revision'], 2)
        current = vc.read_asset(self.asset)
        self.assertEqual(current['spec']['size'], 32)
        self.assertEqual(current['spec']['outline'], 'selective')
        self.assertEqual(current['spec']['keys'], {'blade': ['b', 'B'], 'guard': 'y', 'grip': 'n'})
        self.assertEqual(current['manifest']['width'], 32)
        self.assertEqual(first, {p.name: p.read_bytes() for p in (self.asset / '0001').iterdir()})
        again = vc.publish(self.asset, base=2, patch=change)
        self.assertTrue(again['unchanged'])
        self.assertFalse((self.asset / '0003').exists())
        for bad, base in [(change, 1), ({'set': {'keys': {'blade': 'b'}}}, 2), ({'set': {'kind': 'icon'}}, 2), ({'size': 32}, 2)]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                vc.publish(self.asset, base=base, patch=bad)
            self.assertEqual(vc.read_asset(self.asset)['revision'], 2)
        self.assertFalse(list(self.asset.glob('.visual-*')))
        self.assertFalse((self.asset / '.revision-lock').exists())

    def test_null_resets_a_field_and_character_parts_merge(self):
        hero = self.asset.parent / 'hero'
        vc.publish(hero, pixel.template('hero'))
        vc.publish(hero, base=1, patch={'set': {'parts': {'hair': {'key': 'y'}}, 'variants': None}})
        spec = vc.read_asset(hero)['spec']
        self.assertEqual(spec['parts']['hair'], {'style': 'short', 'key': 'y'})
        self.assertEqual(spec['parts']['outfit'], {'style': 'tunic', 'keys': ['r', 'R']})
        self.assertEqual(spec['variants'], [])

    def test_cli_round_trip_and_actionable_errors(self):
        template = self.cli('template', 'sword')
        path = self.asset.parent / 'sword.json'
        vc.write_json(path, template)
        self.assertTrue(self.cli('check', path)['valid'])
        self.assertEqual(self.cli('create', path, '--out', self.asset)['revision'], 1)
        self.assertEqual(self.cli('read', self.asset)['spec']['name'], 'sword')
        bad = recipe(kind='character', parts={'hair': {'style': 'longg'}, 'held': 'none'}, frames={'walk': 3, 'attack': 3}, colour=1)
        vc.write_json(path, bad)
        result = self.cli('check', path, success=False)
        self.assertFalse(result['published'])
        messages = {p['path']: p['message'] for p in result['problems']}
        self.assertIn("Did you mean 'long'?", messages['parts.hair.style'])
        self.assertIn('exactly 4 frames', messages['frames.walk'])
        self.assertIn('held', messages['frames.attack'])
        self.assertIn('not a field', messages['colour'])
        self.assertIn('Did you mean', self.cli('template', 'heroo', success=False)['error'])
        self.assertIn('sword', self.cli('catalog')['items'])

    def test_unsafe_or_bounded_inputs_are_refused(self):
        bad = [
            recipe(kind='sprite', width=16, height=16, ops=[{'op': 'dither', 'x': 0, 'y': 0, 'w': 4, 'h': 4, 'keys': ['g', 'G']}]),
            recipe(kind='sprite', width=65, height=16, ops=[]),
            recipe(kind='sprite', ops=[{'op': 'script', 'src': 'x'}]),
            recipe(kind='sprite', ops=[{'op': 'rect', 'x': 0, 'y': 0, 'w': 2, 'h': 2, 'key': '#ff0000'}]),
            recipe(kind='item', name='potion', palette='ink', keys={'liquid': ['r']}),
            recipe(kind='character', size=24),
            recipe(kind='character', id='../escape'),
            recipe(kind='button', label='A VERY LONG LABEL TEXT', width=24),
            recipe(kind='tile', name='grass', variants_count=9),
            {'schema': 'visual-core.pixel/2', 'kind': 'icon', 'id': 'x', 'name': 'heart'},
        ]
        for spec in bad:
            with self.subTest(spec=spec), self.assertRaises(ValueError):
                vc.publish(self.asset, spec)
            self.assertFalse(self.asset.exists())

    def test_palette_roles_and_contrast_check(self):
        info = pixel.palette_info('meadow')
        self.assertEqual(info['css']['--g-accent'], '#f2b33d')
        self.assertTrue(all(r >= 4.5 for r in info['contrast'].values()))
        self.assertEqual(pixel.palette_info('meadow', {'--g-accent': 'g'})['css']['--g-accent'], '#5bb85d')
        with self.assertRaises(ValueError):
            pixel.palette_info('meadow', {'--g-text': 'd', '--g-panel': 'w'})
        self.assertEqual(pixel.resolve_key('ink', 'r'), '#aaaaaa')
        self.assertEqual(pixel.resolve_key('arcade', 's'), '#a8552f')


# sha256 of the base sheet's RGBA bytes (first 16 hex digits). Change only with a reviewed art change.
GOLDEN = {
    'hero': '5ee90acb8f044aae',
    'slime': '7556e7f18115b676',
    'boss-slime': '46e539e757901cb4',
    'potion': 'c43705104440aecc',
    'sword': 'c88b6525ebb91afc',
    'grass': '123dec35b6c7e884',
    'heart': '61455932fe4f5a7a',
    'button': 'ad1c1089ee63f834',
    'dialogue-frame': '94a869f460696bd3',
    'gem-sprite': 'ce4ab46c5738ca75'
}

if __name__ == '__main__':
    unittest.main()
