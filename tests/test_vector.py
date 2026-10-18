import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from xml.etree import ElementTree
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
import vector
import visual_core as vc

DESIGNER = json.loads((ROOT / 'tests/fixtures/designer_art_reference.json').read_text())['vector']
INHERIT = ('fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin')
GEOMETRY = {'rect': ('x', 'y', 'width', 'height', 'rx'), 'circle': ('cx', 'cy', 'r'), 'path': ('d',),
            'line': ('x1', 'y1', 'x2', 'y2'), 'ellipse': ('cx', 'cy', 'rx', 'ry')}


def recipe(**fields):
    return {'schema': vector.SCHEMA, 'id': 'x', **fields}


def leaves(svg_text):
    """Every drawn element with inherited paint resolved, transforms ignored (pieces are placed at 0,0)."""
    root = ElementTree.fromstring(svg_text)
    out = []

    def walk(element, inherited):
        here = dict(inherited)
        here.update({k: v for k, v in element.attrib.items() if k in INHERIT})
        tag = element.tag.split('}')[-1]
        if tag in GEOMETRY:
            geometry = []
            for name in GEOMETRY[tag]:
                value = element.attrib.get(name)
                if name == 'd':
                    geometry.append(' '.join(vector.num(v) for _, values in vector.parse_path(value) for v in values))
                else:
                    geometry.append(float(value) if value is not None else 0.0)
            stroke = here.get('stroke', 'none')
            paint = (here.get('fill', 'none'), stroke)
            if stroke != 'none':
                paint += (float(here.get('stroke-width', 1)), here.get('stroke-linecap', 'butt'), here.get('stroke-linejoin', 'miter'))
            out.append((tag, tuple(geometry), paint))
        for child in element:
            walk(child, here)
    walk(root, {})
    return out


def decode(path):
    raw = path.read_bytes()
    width, height = struct.unpack('!II', raw[16:24])
    offset, compressed = 8, b''
    while offset < len(raw):
        length = struct.unpack('!I', raw[offset:offset + 4])[0]
        if raw[offset + 4:offset + 8] == b'IDAT':
            compressed += raw[offset + 8:offset + 8 + length]
        offset += length + 12
    scan = zlib.decompress(compressed)
    stride = width * 4 + 1
    return width, height, b''.join(scan[y * stride + 1:(y + 1) * stride] for y in range(height))


class Vector(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def render(self, spec, name='asset'):
        folder = self.root / name
        folder.mkdir()
        vector.render(spec, folder)
        return folder

    def test_designer_vector_pieces_are_reproduced(self):
        for name in ('hero', 'monster', 'potion', 'grass'):
            spec = vector.validate(recipe(kind='illustration', width=48, height=48, items=[{'piece': name}], layout={'type': 'none'}))
            ours = leaves((self.render(spec, name) / 'asset.svg').read_text())
            with self.subTest(piece=name):
                self.assertEqual(ours, leaves(DESIGNER[name]))
        icon = leaves((self.render(vector.validate(recipe(kind='icon', name='heart')), 'heart') / 'asset.svg').read_text())
        self.assertEqual(icon, leaves(DESIGNER['heart']))

    def test_every_template_is_byte_identical_across_runs_and_safe(self):
        for name in vector.catalog()['templates']:
            with self.subTest(name=name):
                a = Path(vc.publish(self.root / f'{name}-a', vector.template(name))['directory'])
                b = Path(vc.publish(self.root / f'{name}-b', vector.template(name))['directory'])
                for file in sorted(p.name for p in a.iterdir()):
                    self.assertEqual((a / file).read_bytes(), (b / file).read_bytes(), file)
                text = (a / 'asset.svg').read_text()
                for banned in ('<script', 'href', 'url(', '<text', 'foreignObject', 'http://w', 'style'):
                    if banned == 'http://w':
                        self.assertEqual(text.count('http://'), 1)  # only the xmlns
                    else:
                        self.assertNotIn(banned, text)
                manifest = vc.load(a / 'manifest.json')
                self.assertEqual(manifest['svg_sha256'], hashlib.sha256((a / 'asset.svg').read_bytes()).hexdigest())
                w, h, pixels = decode(a / 'preview.png')
                self.assertEqual(hashlib.sha256(pixels).hexdigest(), manifest['pixel_sha256'])
                self.assertEqual([w, h], [manifest['preview']['width'], manifest['preview']['height']])

    def test_every_icon_kind_and_option_renders(self):
        catalog = vector.catalog()
        for name in catalog['icons']:
            for size in (16, 24, 48):
                self.render(vector.validate(recipe(kind='icon', name=name, size=size, palette='dusk')), f'{name}-{size}')
        for kind in catalog['decoration_types']:
            extra = {'label': 'OK'} if kind in ('button', 'badge') else {}
            self.render(vector.validate(recipe(kind='decoration', type=kind, **extra)), f'deco-{kind}')
        for badge in catalog['logo_badges']:
            for layout in ('row', 'column'):
                self.render(vector.validate(recipe(kind='logo', text='KAKKOI 2', emblem='star', badge=badge, layout=layout)), f'logo-{badge}-{layout}')
        for layout in ('row', 'column', 'grid'):
            self.render(vector.validate(recipe(kind='illustration', width=240, height=240, items=[{'piece': p} for p in catalog['pieces'][:6]],
                                               layout={'type': layout, 'columns': 3})), f'ill-{layout}')
        for char in catalog['font']['characters']:
            self.assertTrue(vector.text_paths(char, 0, 6, 6) or char == ' ')

    def test_preview_pixels_follow_the_palette(self):
        folder = self.render(vector.validate(recipe(kind='icon', name='heart')))
        w, h, pixels = decode(folder / 'preview.png')
        def at(x, y):
            return pixels[(y * w + x) * 4:(y * w + x) * 4 + 4]
        self.assertEqual(at(w // 2, h // 2 - 2), bytes.fromhex('e05a47') + b'\xff')  # fill r
        self.assertEqual(at(0, 0), b'\0\0\0\0')
        self.assertEqual(at(w // 2, int(h * 20.5 / 24)), bytes.fromhex('1b1c2b') + b'\xff')  # ink outline at the tip
        recoloured = self.render(vector.validate(recipe(kind='icon', name='heart', fill='b')), 'blue')
        self.assertIn('#4aa3df', (recoloured / 'asset.svg').read_text())

    def test_path_parser(self):
        commands = vector.parse_path('M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z')
        self.assertEqual([c[0] for c in commands], ['M', 'S', 'A', 'A', 'C', 'Z'])
        self.assertEqual(commands[1][1], [5.0, 15.6, 5.0, 10.0])
        points = vector.flatten(vector.parse_path('M0 0A5 5 0 0 1 10 0'))[0][0]
        self.assertAlmostEqual(min(p[1] for p in points), -5, places=6)
        for bad in ('L0 0', 'M0 0 L', 'M0 0 X 1 2', 'M0 0 url(#a)', 'M0 0 Z 3', 'M1e9 0', '', 'M0 0" onload="x'):
            with self.subTest(d=bad), self.assertRaises(ValueError):
                vector.parse_path(bad)

    def test_invalid_recipes_report_actionable_problems(self):
        bad = [
            recipe(kind='icon', name='potoin'),
            recipe(kind='icon', name='heart', fill='#ff0000'),
            recipe(kind='logo', text='<script>'),
            recipe(kind='logo', text='LOW', badge='round', colours={'text': 'd', 'badge': 'w'}),
            recipe(kind='drawing', shapes=[{'shape': 'path', 'd': 'M0 0L4 4', 'onclick': 'x'}]),
            recipe(kind='drawing', shapes=[{'shape': 'image', 'href': 'http://example.com/a.png'}]),
            recipe(kind='diagram', nodes=[{'id': 'a', 'label': 'A'}], edges=[{'from': 'a', 'to': 'b'}]),
            recipe(kind='decoration', type='button', label='A LABEL FAR TOO LONG', width=60),
            recipe(kind='illustration', items=[{'piece': 'hero', 'scale': 7}]),
            recipe(kind='icon', name='heart', id='Bad Id'),
        ]
        for spec in bad:
            with self.subTest(spec=spec), self.assertRaises(ValueError):
                vc.publish(self.root / 'bad', spec)
            self.assertFalse((self.root / 'bad').exists())
        try:
            vector.validate(recipe(kind='icon', name='potoin'))
        except vector.RecipeError as error:
            self.assertIn("Did you mean 'potion'?", str(error))

    def test_revision_recolour_bigger_and_noop(self):
        asset = self.root / 'potion'
        vc.publish(asset, vector.template('potion-icon'))
        first = {p.name: p.read_bytes() for p in (asset / '0001').iterdir()}
        change = {'set': {'fill': 'b', 'size': 48}}
        self.assertEqual(vc.publish(asset, base=1, patch=change)['revision'], 2)
        svg = (asset / '0002/asset.svg').read_text()
        self.assertIn('width="48"', svg)
        self.assertIn('#4aa3df', svg)
        self.assertTrue(vc.publish(asset, base=2, patch=change)['unchanged'])
        self.assertFalse((asset / '0003').exists())
        self.assertEqual(first, {p.name: p.read_bytes() for p in (asset / '0001').iterdir()})
        with self.assertRaises(ValueError):
            vc.publish(asset, base=2, patch={'set': {'kind': 'logo'}})

    def test_cli(self):
        def cli(*args, success=True):
            result = subprocess.run([sys.executable, str(ROOT / 'tools/visual.py'), 'vector', *map(str, args)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0 if success else 1, result.stdout + result.stderr)
            return json.loads(result.stdout)
        self.assertIn('potion', cli('catalog')['icons'])
        path = self.root / 'logo.json'
        vc.write_json(path, cli('template', 'title-logo'))
        self.assertTrue(cli('check', path)['valid'])
        self.assertEqual(cli('create', path, '--out', self.root / 'logo')['revision'], 1)
        vc.write_json(path, recipe(kind='logo', text='HI', badge='oval'))
        problems = cli('check', path, success=False)['problems']
        self.assertEqual(problems[0]['path'], 'badge')
        self.assertIn('round', problems[0]['allowed'])


if __name__ == '__main__':
    unittest.main()
