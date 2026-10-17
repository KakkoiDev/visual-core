import copy
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
sys.path.insert(0, str(ROOT / 'tools'))
import visual_core as vc
from new_core import generate
from vendor import check as check_vendor


class Assets(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.asset = self.root / 'robot'
        self.spec = vc.load(ROOT / 'presets/robot.json')

    def cli(self, *args, success=True):
        result = subprocess.run([sys.executable, str(ROOT/'tools/visual.py'), *map(str, args)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0 if success else 1, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def test_png_and_atlas_match_source_pixels(self):
        result = vc.publish(self.asset, self.spec)
        directory = Path(result['directory'])
        data = (directory/'sheet.png').read_bytes()
        self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
        cursor, chunks, compressed = 8, [], bytearray()
        while cursor < len(data):
            length = struct.unpack('!I', data[cursor:cursor+4])[0]
            kind = data[cursor+4:cursor+8]
            payload = data[cursor+8:cursor+8+length]
            checksum = struct.unpack('!I', data[cursor+8+length:cursor+12+length])[0]
            self.assertEqual(checksum, zlib.crc32(kind+payload) & 0xffffffff)
            chunks.append(kind)
            if kind == b'IHDR':
                self.assertEqual(struct.unpack('!2I5B', payload), (32, 16, 8, 6, 0, 0, 0))
            if kind == b'IDAT':
                compressed.extend(payload)
            cursor += length + 12
        self.assertEqual(chunks, [b'IHDR', b'IDAT', b'IEND'])
        scan = zlib.decompress(compressed)
        self.assertEqual(len(scan), (32*4+1)*16)
        for y in range(16):
            self.assertEqual(scan[y*129], 0)
            for index, frame in enumerate(self.spec['frames']):
                for x, key in enumerate(frame['rows'][y]):
                    pos = y*129+1+(index*16+x)*4
                    expected = b'\0'*4 if key == '.' else bytes.fromhex(self.spec['palette'][key][1:])+b'\xff'
                    self.assertEqual(scan[pos:pos+4], expected)
        atlas = vc.load(directory/'atlas.json')
        self.assertEqual([(f['id'], f['x'], f['ms']) for f in atlas['frames']], [('idle', 0, 240), ('bounce', 16, 160)])
        for name, digest in vc.load(directory/'manifest.json')['sha256'].items():
            self.assertEqual(hashlib.sha256((directory/name).read_bytes()).hexdigest(), digest)
        second = vc.publish(self.root/'same', self.spec)
        self.assertEqual(vc.load(Path(second['directory'])/'manifest.json'), vc.load(directory/'manifest.json'))
        self.assertEqual(result['visual_review'], 'not-performed')

    def test_revision_preserves_unaffected_source_and_history(self):
        vc.publish(self.asset, self.spec)
        first = {p.name: p.read_bytes() for p in (self.asset/'0001').iterdir()}
        vc.publish(self.asset, base=1, patch={'frames': [{'id': 'bounce', 'ms': 400}]})
        current = vc.read_asset(self.asset)
        self.assertEqual(current['revision'], 2)
        expected = copy.deepcopy(self.spec)
        expected['frames'][1]['ms'] = 400
        self.assertEqual(current['spec'], expected)
        self.assertEqual(first, {p.name: p.read_bytes() for p in (self.asset/'0001').iterdir()})
        for patch, base in [({'set': {'color': 'bad'}}, 2), ({'frames': [{'id': 'missing', 'ms': 50}]}, 2), ({}, 1)]:
            with self.assertRaises(ValueError):
                vc.publish(self.asset, base=base, patch=patch)
            self.assertEqual(vc.read_asset(self.asset)['revision'], 2)
        self.assertFalse(list(self.asset.glob('.visual-*')))
        self.assertFalse((self.asset/'.revision-lock').exists())

    def test_lock_collision_preserves_other_writer(self):
        vc.publish(self.asset, self.spec)
        lock = self.asset/'.revision-lock'
        lock.write_text('another writer')
        with self.assertRaisesRegex(ValueError, 'Another revision'):
            vc.publish(self.asset, base=1, patch={})
        self.assertEqual(lock.read_text(), 'another writer')
        self.assertEqual(vc.read_asset(self.asset)['revision'], 1)
        self.assertFalse(list(self.asset.glob('.visual-*')))

    def test_invalid_inputs_publish_nothing(self):
        bad = []
        for changes in ({'width': True}, {'width': 65}, {'execute': 'anything'}, {'palette': {'<': '#ffffff'}}, {'palette': {'0': 'red'}}, {'frames': []}):
            candidate = copy.deepcopy(self.spec)
            candidate.update(changes)
            bad.append(candidate)
        candidate = copy.deepcopy(self.spec)
        candidate['frames'][1]['id'] = 'idle'
        bad.append(candidate)
        candidate = copy.deepcopy(self.spec)
        for frame in candidate['frames']:
            frame['rows'] = ['.'*16]*16
        bad.append(candidate)
        for candidate in bad:
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                vc.publish(self.asset, candidate)
            self.assertFalse(self.asset.exists())

    def test_paths_and_existing_assets(self):
        vc.publish(self.asset, self.spec)
        with self.assertRaises(ValueError):
            vc.publish(self.asset, self.spec)
        link = self.root/'linked'
        link.symlink_to(self.asset, target_is_directory=True)
        with self.assertRaises(ValueError):
            vc.read_asset(link)

    def test_failed_render_keeps_current_and_cleans_stage(self):
        vc.publish(self.asset, self.spec)
        with patch.object(vc, 'render', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                vc.publish(self.asset, base=1, patch={})
        self.assertEqual(vc.read_asset(self.asset)['revision'], 1)
        self.assertFalse((self.asset/'0002').exists())
        self.assertFalse(list(self.asset.glob('.visual-*')))
        self.assertFalse((self.asset/'.revision-lock').exists())

    def test_corrupt_pointer_reports_json_error(self):
        vc.publish(self.asset, self.spec)
        vc.write_json(self.asset/'current.json', [])
        result = self.cli('read', self.asset, success=False)
        self.assertIn('object', result['error'])
        self.assertFalse(result['published'])

    def test_icon_and_contrast(self):
        icon = vc.load(ROOT/'presets/icon.json')
        directory = Path(vc.publish(self.asset, icon)['directory'])
        from xml.etree import ElementTree
        svg = ElementTree.parse(directory/'asset.svg').getroot()
        self.assertEqual(svg.attrib['viewBox'], '0 0 24 24')
        for color in ('red', '#fff', '#ffffff" onload="alert(1)'):
            with self.assertRaises(ValueError):
                vc.patch_spec(icon, {'set': {'color': color}})
        self.assertAlmostEqual(vc.contrast('#ffffff', '#000000'), 21)
        for foreground, background in [('#172f36','#f6f3eb'),('#50626a','#ffffff'),('#ffffff','#12675f'),('#12675f','#f6f3eb')]:
            self.assertGreaterEqual(vc.contrast(foreground, background), 4.5)

    def test_cli_and_web_starter(self):
        self.assertEqual(self.cli('template', 'robot'), self.spec)
        specfile = self.root/'input.json'
        vc.write_json(specfile, self.spec)
        self.assertEqual(self.cli('create', specfile, '--out', self.asset)['revision'], 1)
        self.assertFalse(self.cli('create', specfile, '--out', self.asset, success=False)['published'])
        self.assertEqual(self.cli('read', self.asset)['spec'], self.spec)
        app = self.root/'app'
        self.cli('init', 'web-app', '--out', app)
        before = (app/'index.html').read_bytes()
        self.cli('init', 'web-app', '--out', app, success=False)
        self.assertEqual((app/'index.html').read_bytes(), before)
        provenance = vc.load(app/'vendor/visual-core/provenance.json')
        self.assertEqual(provenance['css_sha256'], hashlib.sha256((app/'vendor/visual-core/visual-core.css').read_bytes()).hexdigest())

    def test_generated_core_is_honest_and_valid(self):
        out = generate('physics-core', self.root/'physics-core')
        self.assertTrue((out/'tests/README.md').is_file())
        for path in out.rglob('*'):
            if path.is_file():
                self.assertNotIn('{{CORE_NAME}}', path.read_text())
        self.assertEqual(vc.load(out/'CAPABILITIES.json')['capabilities'][0]['status'], 'planned')
        result = subprocess.run([sys.executable, str(out/'tools/validate.py')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        with self.assertRaises(ValueError):
            generate('physics-core', out)
        with self.assertRaises(ValueError):
            generate('../escape-core', self.root/'escaped')

    def test_upstream_generator_determinism_and_revision(self):
        config = vc.load(ROOT/'presets/generators/ship.json')
        source = vc.generate_spec(config)
        self.assertEqual(source, vc.generate_spec(config))
        changed = vc.generate_spec({**config, 'seed':43})
        self.assertNotEqual(source['frames'], changed['frames'])
        self.assertEqual(source['palette'], changed['palette'])
        for row in source['frames'][0]['rows']:
            self.assertEqual(row, row[::-1])
        result = self.cli('generate','ship','--seed',42,'--out',self.asset)
        original = vc.read_asset(self.asset)
        self.assertEqual(original['spec'], source)
        self.assertEqual(original['generator']['config']['seed'],42)
        self.assertTrue((Path(result['directory'])/'LICENSE-pixel-sprite-generator.txt').is_file())
        vc.publish(self.asset, base=1, patch={'frames':[{'id':'idle','ms':400}]})
        revised = vc.read_asset(self.asset)
        self.assertEqual(original['generator'], revised['generator'])
        self.assertEqual(source['frames'][0]['rows'], revised['spec']['frames'][0]['rows'])

    def test_generator_rejects_invalid_parameters(self):
        config = vc.load(ROOT/'presets/generators/ship.json')
        for update in ({'seed':-1}, {'seed':True}, {'seed':4294967296}, {'mask':'../../evil'}, {'execute':'code'}, {'palette':{'0':'red'}}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                vc.generate_spec({**config, **update})

    def test_vendor_hashes_detect_tampering(self):
        self.assertEqual(check_vendor()['basecoat'],'1.0.2')
        vendor = self.root/'vendor'
        (vendor/'example').mkdir(parents=True)
        (vendor/'example/file.js').write_text('original')
        vc.write_json(vendor/'LOCK.json', {'schema_version':1,'sources':[{'id':'example','version':'1','sha256':{'file.js':hashlib.sha256(b'original').hexdigest()}}]})
        self.assertEqual(check_vendor(vendor), {'example':'1'})
        (vendor/'example/file.js').write_text('changed')
        with self.assertRaisesRegex(ValueError,'hash mismatch'):
            check_vendor(vendor)

    def test_lucide_icons_have_geometry_and_license(self):
        from xml.etree import ElementTree
        self.assertGreaterEqual(len(vc.ICON_PATHS),50)
        for index, shape in enumerate(vc.ICON_PATHS):
            spec = {**vc.load(ROOT/'presets/icon.json'), 'shape':shape}
            folder = self.root/f'icon-{index}'
            folder.mkdir()
            vc.render(spec,folder)
            svg = ElementTree.parse(folder/'asset.svg').getroot()
            self.assertGreater(len(list(svg.iter())),3)
            self.assertTrue((folder/'LICENSE-lucide.txt').is_file())

    def test_legacy_icon_style_edits_keep_approved_geometry(self):
        spec = vc.load(ROOT/'presets/icon.json')
        old = self.asset/'0001'
        old.mkdir(parents=True)
        vc.render(spec, old, legacy_icon=True)
        manifest = vc.load(old/'manifest.json')
        manifest['version'] = '0.1.0'
        manifest.pop('icon_library')
        vc.write_json(old/'manifest.json',manifest)
        vc.write_json(self.asset/'current.json',{'revision':1})
        for base, color in [(1,'#ffffff'),(2,'#000000')]:
            vc.publish(self.asset, base=base, patch={'set':{'color':color}})
            current = vc.read_asset(self.asset)
            svg = (Path(current['directory'])/'asset.svg').read_text()
            self.assertIn(vc.LEGACY_ICON_PATHS['check'],svg)
            self.assertEqual(current['manifest']['icon_library'],'visual-core-legacy')
        vc.publish(self.asset, base=3, patch={'set':{'shape':'leaf'}})
        self.assertEqual(vc.read_asset(self.asset)['manifest']['icon_library'],'lucide-1.59.0')


if __name__ == '__main__':
    unittest.main()
