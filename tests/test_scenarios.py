"""End-to-end tests for SCENARIOS.md: one test per command scenario, named after its title.

Each test runs the public entry point, `tools/visual.py`, in a scratch folder and checks what a person gets: the files,
the printed result and the decoded pixels (compared with the digests recorded in tests/fixtures/scenario_pixels.json,
so a change to the art is a visible, deliberate update). Offline; standard library only.

Record new pixels after an intended art change: VISUAL_CORE_RECORD_PIXELS=1 python3 -m unittest tests.test_scenarios
"""
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
DIGESTS = ROOT / 'tests/fixtures/scenario_pixels.json'
RECORD = os.environ.get('VISUAL_CORE_RECORD_PIXELS') == '1'
REMOTE = re.compile(r'(?:src|href)\s*=\s*["\']?(?:https?:)?//', re.I)


def pixels(path):
    """(width, height, sha256 of the RGBA rows) of an 8-bit PNG, decoded with every row filter undone."""
    raw = Path(path).read_bytes()
    assert raw[:8] == b'\x89PNG\r\n\x1a\n', path
    offset, data, header = 8, b'', None
    while offset < len(raw):
        length = struct.unpack('!I', raw[offset:offset + 4])[0]
        kind, payload = raw[offset + 4:offset + 8], raw[offset + 8:offset + 8 + length]
        if kind == b'IHDR':
            header = struct.unpack('!IIBBBBB', payload)
        elif kind == b'IDAT':
            data += payload
        offset += 12 + length
    width, height, depth, colour = header[:4]
    assert depth == 8 and colour in (2, 6), (path, depth, colour)
    channels = 4 if colour == 6 else 3
    stride, scan = width * channels, zlib.decompress(data)
    rows, previous = [], bytearray(stride)
    for y in range(height):
        kind, line = scan[y * (stride + 1)], bytearray(scan[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b, c = previous[i], previous[i - channels] if i >= channels else 0
            if kind == 1:
                line[i] = (line[i] + a) & 255
            elif kind == 2:
                line[i] = (line[i] + b) & 255
            elif kind == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif kind == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(bytes(line))
        previous = line
    return width, height, hashlib.sha256(b''.join(rows)).hexdigest()


class Scenarios(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.recorded = json.loads(DIGESTS.read_text()) if DIGESTS.exists() else {}

    @classmethod
    def tearDownClass(cls):
        if RECORD:
            DIGESTS.write_text(json.dumps(cls.recorded, indent=2, sort_keys=True) + '\n')

    def setUp(self):
        self.scratch = Path(tempfile.mkdtemp(prefix='visual-scenario-')).resolve()
        self.addCleanup(lambda: subprocess.run(['rm', '-rf', str(self.scratch)], check=False))

    def visual(self, *args, ok=True):
        """Run the CLI like a person would, from the scratch folder; return the parsed JSON (or text) it prints."""
        done = subprocess.run([sys.executable, str(ROOT / 'tools/visual.py'), *map(str, args)], cwd=self.scratch,
                              capture_output=True, text=True, timeout=180)
        if ok:
            self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        else:
            self.assertNotEqual(done.returncode, 0, done.stdout)
        try:
            return json.loads(done.stdout)
        except json.JSONDecodeError:
            return done.stdout

    def save(self, name, text):
        path = self.scratch / name
        path.write_text(text if isinstance(text, str) else json.dumps(text))
        return path

    def assert_recorded(self, name, png):
        width, height, digest = pixels(png)
        if RECORD:
            self.recorded[name] = {'width': width, 'height': height, 'sha256': digest}
        self.assertEqual({'width': width, 'height': height, 'sha256': digest}, self.recorded.get(name),
                         f'{name}: pixels differ from the recorded art (record again only for an intended change)')

    # Commands

    def test_start_a_web_app_board_in_an_empty_folder(self):
        # Given an empty scratch folder / When I run init web-app
        result = self.visual('init', 'web-app', '--out', 'board')
        # Then the folder holds the page, its script and the vendored styles, with no remote URL
        board = self.scratch / 'board'
        self.assertEqual(result['entry'], 'index.html')
        for name in ('index.html', 'app.js', 'vendor/basecoat/basecoat.min.css', 'vendor/basecoat/all.min.js',
                     'vendor/visual-core/visual-core.css', 'vendor/visual-core/provenance.json'):
            self.assertTrue((board / name).is_file(), name)
        self.assertIsNone(REMOTE.search((board / 'index.html').read_text()))
        self.assertEqual(list(self.scratch.glob('.visual-ui-*')), [])

    def test_starting_a_web_app_over_an_existing_folder_is_refused(self):
        # Given a scratch folder that already holds a file
        (self.scratch / 'board').mkdir()
        mine = self.save('board/index.html', 'my own page')
        # When I run init web-app into it
        result = self.visual('init', 'web-app', '--out', 'board', ok=False)
        # Then it fails with a readable error and the file is untouched
        self.assertIn('Output exists', result['error'])
        self.assertEqual(mine.read_text(), 'my own page')

    def test_copy_the_component_kit(self):
        self.visual('init', 'component-kit', '--out', 'kit')
        kit = self.scratch / 'kit'
        for name in ('index.html', 'kit.js', 'vendor/basecoat/basecoat.min.css', 'vendor/basecoat/LICENSE.md'):
            self.assertTrue((kit / name).is_file(), name)
        self.assertIn('Keep this note', (kit / 'index.html').read_text())

    def test_generate_the_same_ship_twice_from_one_seed(self):
        # Given two empty scratch folders / When I generate ship seed 42 into each
        first = self.visual('generate', 'ship', '--seed', '42', '--out', 'one')
        self.visual('generate', 'ship', '--seed', '42', '--out', 'two')
        # Then both sheets have the same pixels, matching the recorded ship, with a preview page
        self.assertEqual(first['metrics']['width'], 12)
        one, two = self.scratch / 'one/0001', self.scratch / 'two/0001'
        self.assertEqual(pixels(one / 'sheet.png'), pixels(two / 'sheet.png'))
        self.assert_recorded('ship-seed-42', one / 'sheet.png')
        self.assertTrue((one / 'preview.html').is_file())

    def test_draw_an_icon_from_the_icon_template(self):
        spec = self.save('icon.json', self.visual('template', 'icon'))
        result = self.visual('create', spec, '--out', 'icon')
        svg = (self.scratch / 'icon/0001/asset.svg').read_text()
        self.assertEqual(result['revision'], 1)
        self.assertIn('width="24"', svg)
        self.assertNotIn('<script', svg.lower())
        self.assertIsNone(REMOTE.search(svg))

    def test_draw_the_robot_from_exact_pixel_rows(self):
        template = self.visual('template', 'robot')
        self.visual('create', self.save('robot.json', template), '--out', 'robot')
        out = self.scratch / 'robot/0001'
        self.assert_recorded('robot', out / 'sheet.png')
        atlas = json.loads((out / 'atlas.json').read_text())
        self.assertEqual([f['id'] for f in atlas['frames']], [f['id'] for f in template['frames']])

    def robot_at_revision_2(self):
        self.visual('create', self.save('robot.json', self.visual('template', 'robot')), '--out', 'robot')
        palette = dict(self.visual('read', 'robot')['spec']['palette'], **{'0': '#000000'})
        self.visual('revise', 'robot', '--base', '1', '--patch', self.save('patch.json', {'set': {'palette': palette}}))
        return self.scratch / 'robot'

    def test_change_the_robot_s_palette_and_keep_the_first_revision(self):
        # Given a robot asset at revision 1
        self.visual('create', self.save('robot.json', self.visual('template', 'robot')), '--out', 'robot')
        before = {p.name: p.read_bytes() for p in (self.scratch / 'robot/0001').iterdir()}
        # When I revise it on base 1 with a darker palette colour
        palette = dict(self.visual('read', 'robot')['spec']['palette'], **{'0': '#000000'})
        result = self.visual('revise', 'robot', '--base', '1', '--patch', self.save('patch.json', {'set': {'palette': palette}}))
        # Then revision 2 has the new colour and revision 1's files are unchanged
        self.assertEqual(result['revision'], 2)
        self.assertEqual(self.visual('read', 'robot')['spec']['palette']['0'], '#000000')
        self.assertEqual({p.name: p.read_bytes() for p in (self.scratch / 'robot/0001').iterdir()}, before)
        self.assertNotEqual(pixels(self.scratch / 'robot/0001/sheet.png'), pixels(self.scratch / 'robot/0002/sheet.png'))

    def test_a_revision_on_a_stale_base_is_refused(self):
        robot = self.robot_at_revision_2()
        result = self.visual('revise', 'robot', '--base', '1', '--patch', self.scratch / 'patch.json', ok=False)
        self.assertIn('Stale base', result['error'])
        self.assertFalse((robot / '0003').exists())
        self.assertEqual(json.loads((robot / 'current.json').read_text())['revision'], 2)

    def test_draw_a_legacy_terrain_sheet(self):
        self.visual('create', self.save('terrain.json', self.visual('template', 'terrain')), '--out', 'terrain')
        self.assert_recorded('legacy-terrain', self.scratch / 'terrain/0001/sheet.png')

    def test_build_the_meadow_terrain(self):
        recipe = self.save('meadow.json', self.visual('terrain', 'template', 'meadow'))
        self.visual('terrain', 'create', recipe, '--out', 'meadow')
        out = self.scratch / 'meadow/0001'
        self.assert_recorded('meadow', out / 'preview-native.png')
        self.assertTrue(json.loads((out / 'quality.json').read_text())['passed'])

    def test_draw_the_hero_from_a_pixel_recipe(self):
        recipe = self.save('hero.json', self.visual('pixel', 'template', 'hero'))
        self.assertTrue(self.visual('pixel', 'check', recipe)['valid'])
        self.visual('pixel', 'create', recipe, '--out', 'hero')
        self.assert_recorded('hero', self.scratch / 'hero/0001/sheet.png')

    def test_make_a_library_gem_bigger_in_a_new_colour(self):
        # Given a gem from the item library at 16 pixels
        gem = self.visual('pixel', 'template', 'item.gem')
        self.assertEqual(gem['size'], 16)
        self.visual('pixel', 'create', self.save('gem.json', gem), '--out', 'gem')
        # When I revise it to 32 pixels with green stone keys
        slot = next(iter(gem['keys']))
        patch = self.save('patch.json', {'set': {'size': 32, 'keys': {slot: ['g', 'G']}}})
        self.assertEqual(self.visual('pixel', 'revise', 'gem', '--base', '1', '--patch', patch)['revision'], 2)
        # Then revision 2 is 32 wide with different pixels and revision 1 is kept
        first, second = pixels(self.scratch / 'gem/0001/sheet.png'), pixels(self.scratch / 'gem/0002/sheet.png')
        self.assertEqual(first[:2], (16, 16))
        self.assertEqual(second[0], 32)
        self.assert_recorded('gem-32-green', self.scratch / 'gem/0002/sheet.png')

    def test_draw_the_title_logo_as_clean_svg(self):
        recipe = self.save('logo.json', self.visual('vector', 'template', 'title-logo'))
        self.visual('vector', 'create', recipe, '--out', 'logo')
        svg = (self.scratch / 'logo/0001/asset.svg').read_text()
        self.assertNotIn('<script', svg.lower())
        self.assertIsNone(REMOTE.search(svg))
        self.assertNotIn('<text', svg)
        self.assert_recorded('title-logo', self.scratch / 'logo/0001/preview.png')

    def test_a_spec_with_an_unknown_kind_is_refused(self):
        result = self.visual('check', self.save('bad.json', {'name': 'bad'}), ok=False)
        self.assertEqual(result, {'error': 'kind must be icon or pixel', 'published': False})

    def test_measure_text_contrast(self):
        result = self.visual('contrast', '#000000', '#ffffff')
        self.assertEqual(result, {'ratio': 21.0, 'normal_text_4_5': True, 'large_text_or_ui_3': True})

    def test_list_what_the_toolbox_can_do(self):
        capabilities = self.visual('catalog')['capabilities']['capabilities']
        implemented = [c for c in capabilities if c['status'] == 'implemented']
        self.assertGreaterEqual(len(implemented), 10)
        for capability in implemented:
            with self.subTest(capability=capability['id']):
                self.assertTrue(capability['command'])
                self.assertTrue((ROOT / capability['recipe']).is_file())


if __name__ == '__main__':
    unittest.main()
