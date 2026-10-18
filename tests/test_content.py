import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
import pixel
import vector
import visual_core as vc


class ContentLibrary(unittest.TestCase):
    def test_every_pack_states_an_original_or_checked_licence(self):
        for path in sorted((ROOT / 'content').rglob('*.json')):
            data = json.loads(path.read_text())
            text = data.get('license', data.get('source', ''))
            with self.subTest(pack=path.name):
                self.assertTrue('Original to visual-core' in text or 'ArtPalettes' in text, text)

    def test_every_library_entry_is_a_ready_recipe(self):
        names = pixel.library_templates()
        self.assertGreaterEqual(len(names), 40)
        for name in names:
            spec = pixel.validate(pixel.template(name))
            cells = pixel.cells_for(spec)
            records, w, h = pixel.layout(spec, cells)
            with self.subTest(name=name):
                self.assertTrue(pixel.quality(spec, [pixel.sheet(records, w, h)], spec['palette'])['passed'])
        self.assertIn('item.gem', pixel.catalog()['library_templates'])

    def test_same_item_new_colour_bigger_for_every_item(self):
        with tempfile.TemporaryDirectory() as temp:
            for name, item in pixel.PACKS['items']['items'].items():
                asset = Path(temp).resolve() / name
                vc.publish(asset, pixel.template(f'item.{name}'))
                slot, keys = next(iter(item['slots'].items()))
                new = ['b', 'B'][:len(keys)] if keys[0] != 'b' else ['g', 'G'][:len(keys)]
                result = vc.publish(asset, base=1, patch={'set': {'size': 32, 'keys': {slot: new}}})
                with self.subTest(item=name):
                    self.assertEqual(result['revision'], 2)
                    self.assertEqual(vc.read_asset(asset)['manifest']['width'], 32)
                    self.assertTrue((asset / '0001/sheet.png').is_file())

    def test_scattered_tiles_keep_their_detail_and_wrap(self):
        for name, tile in pixel.PACKS['tiles']['tiles'].items():
            grid = tile['grid']
            self.assertTrue(len(grid) == 16 and all(len(r) == 16 for r in grid), name)
            if not tile.get('scatter'):
                continue
            spec = pixel.validate(pixel.template(f'tile.{name}'))
            detail = sum(c != tile['base'] for r in grid for c in r)
            for _, index, canvas in pixel.cells_for(spec):
                with self.subTest(tile=name, variant=index):
                    self.assertEqual(sum(c != tile['base'] for r in canvas for c in r), detail)
                    self.assertLess(detail / 256, 0.15)

    def test_buildings_and_frame_sources(self):
        catalog = pixel.catalog()['buildings']
        for size in (32, 64):
            for wall in catalog['wall']:
                for roof in catalog['roof.style']:
                    for door in catalog['door']:
                        spec = pixel.validate({'schema': pixel.SCHEMA, 'kind': 'building', 'id': 'b', 'size': size,
                                               'parts': {'wall': wall, 'roof': {'style': roof, 'colour': 'blue'}, 'door': door, 'windows': 2, 'chimney': True}})
                        canvas = pixel.cells_for(spec)[0][2]
                        self.assertEqual(pixel.size_of(canvas), (size, size))
        with self.assertRaises(ValueError):
            pixel.validate({'schema': pixel.SCHEMA, 'kind': 'building', 'id': 'b', 'size': 16})
        for name in ('walls', 'roofs', 'doors'):
            for key, ops in pixel.PACKS['buildings'][name].items():
                check = pixel.Check()
                pixel.check_ops(check, ops, f'{name}.{key}')
                self.assertEqual(check.problems, [])
        for source in pixel.catalog()['frame_sources']:
            spec = pixel.validate({'schema': pixel.SCHEMA, 'kind': 'frame', 'id': 'f', 'source': source, 'width': 12, 'height': 12})
            rows = [''.join(c or '.' for c in r) for r in pixel.cells_for(spec)[0][2]]
            self.assertEqual(rows, pixel.PACKS['frames'][source]['grid'])

    def test_every_vector_piece_renders_safely(self):
        with tempfile.TemporaryDirectory() as temp:
            for i, name in enumerate(vector.piece_names()):
                folder = Path(temp) / str(i)
                folder.mkdir()
                spec = vector.validate({'schema': vector.SCHEMA, 'kind': 'illustration', 'id': 'p', 'width': 64, 'height': 64, 'items': [{'piece': name}]})
                self.assertTrue(vector.render(spec, folder)['quality']['passed'], name)


if __name__ == '__main__':
    unittest.main()
