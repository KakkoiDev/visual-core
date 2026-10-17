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
sys.path.insert(0, str(ROOT/'src'))
import terrain
import visual_core as vc


def decode(path):
    raw = path.read_bytes()
    width,height = struct.unpack('!II',raw[16:24])
    offset=8; compressed=b''
    while offset < len(raw):
        length=struct.unpack('!I',raw[offset:offset+4])[0]
        if raw[offset+4:offset+8] == b'IDAT': compressed += raw[offset+8:offset+8+length]
        offset += length+12
    rows=zlib.decompress(compressed)
    return width,height,b''.join(rows[y*(width*4+1)+1:(y+1)*(width*4+1)] for y in range(height))


class TerrainTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve()

    def test_presets_export_palette_seams_and_stable_variants(self):
        for name,size in [('meadow',16),('coast',32),('dungeon',64)]:
            spec=terrain.template(name); spec['tile_size']=size; spec['variants']=4
            spec['contour']['profile']='square' if name=='dungeon' else 'soft'
            result=vc.publish(self.root/name,spec)
            folder=Path(result['directory']); manifest=vc.load(folder/'manifest.json')
            self.assertEqual(len(manifest['tiles']),188)
            self.assertEqual(result['metrics']['compatible_pair_checks'],1504)
            w,h,pixels=decode(folder/'atlas.png')
            self.assertEqual((w,h),(12*size,16*size))
            expected={bytes.fromhex(c[1:])+b'\xff' for c in terrain.PALETTES[spec['palette']]}|{b'\0'*4}
            self.assertLessEqual({pixels[i:i+4] for i in range(0,len(pixels),4)},expected)
            # Every unused atlas slot must remain transparent.
            for v in range(4):
                for y in range((v*4+1)*size,(v*4+2)*size):
                    self.assertEqual(pixels[(y*w+10*size)*4:(y*w+11*size)*4],b'\0'*(size*4))
            self.assertEqual(hashlib.sha256(pixels).hexdigest(),manifest['pixel_sha256']['atlas'])
            # Variants must actually differ for at least the broad center tile.
            tiles=[t for t in manifest['tiles'] if t['mask']==255]
            signatures=[]
            for t in tiles:
                signatures.append(b''.join(pixels[((t['y']+y)*w+t['x'])*4:((t['y']+y)*w+t['x']+size)*4] for y in range(size)))
            self.assertGreater(len(set(signatures)),1)

    def test_revision_preserves_history_ids_seed_and_noop(self):
        asset=self.root/'meadow'; spec=terrain.template('meadow')
        first=vc.publish(asset,spec); old=Path(first['directory']); before=(old/'atlas.png').read_bytes()
        old_manifest=vc.load(old/'manifest.json')
        second=vc.publish(asset,base=1,patch={'set':{'detail':'low'}})
        self.assertEqual(second['revision'],2)
        current=vc.read_asset(asset)
        self.assertEqual(current['spec']['seed'],42)
        self.assertEqual(current['manifest']['tiles'],old_manifest['tiles'])
        self.assertEqual((old/'atlas.png').read_bytes(),before)
        self.assertTrue(vc.publish(asset,base=2,patch={'set':{'detail':'low'}})['unchanged'])
        with self.assertRaisesRegex(ValueError,'Stale'): vc.publish(asset,base=1,patch={'set':{'detail':'high'}})
        with patch('terrain.render',side_effect=ValueError('injected renderer failure')):
            with self.assertRaises(ValueError): vc.publish(asset,base=2,patch={'set':{'detail':'high'}})
        self.assertEqual(vc.read_asset(asset)['revision'],2)
        self.assertFalse((asset/'.revision-lock').exists())
        with self.assertRaises(ValueError): vc.publish(asset,base=2,patch={'set':{'seed':4}})

    def test_strict_input_and_cli_errors(self):
        path=self.root/'invalid.json'; path.write_text('{"schema":"visual-core.terrain/1","id":"a","id":"b"}')
        with self.assertRaisesRegex(ValueError,'Duplicate'): terrain.load(path)
        for updates in [{'variants':True},{'seed':-1},{'tile_size':17},{'palette':'unknown'},{'detail':'busy'},{'topology':'dual16'},{'anything':1}]:
            spec=terrain.template('meadow'); spec.update(updates)
            with self.assertRaises(ValueError): terrain.validate(spec)
        path.write_text(json.dumps({**terrain.template('meadow'),'variants':9}))
        output=self.root/'should-not-exist'
        result=subprocess.run([sys.executable,str(ROOT/'tools/visual.py'),'terrain','create',str(path),'--out',str(output)],capture_output=True,text=True)
        self.assertEqual(result.returncode,1)
        self.assertFalse(json.loads(result.stdout)['published']); self.assertFalse(output.exists())

    def test_variant_addition_preserves_existing_pixels_and_lock(self):
        asset=self.root/'a'; spec=terrain.template('coast'); vc.publish(asset,spec)
        _,_,old=decode(asset/'0001/atlas.png')
        vc.publish(asset,base=1,patch={'set':{'variants':4}})
        _,_,new=decode(asset/'0002/atlas.png'); self.assertEqual(old,new[:len(old)])
        (asset/'.revision-lock').write_text('other writer')
        with self.assertRaisesRegex(ValueError,'Another'): vc.publish(asset,base=2,patch={'set':{'detail':'low'}})
        self.assertEqual((asset/'.revision-lock').read_text(),'other writer')
        (asset/'.revision-lock').unlink()
        generator=asset/'0002/generator.json'; data=vc.load(generator); data['adapter_sha256']='changed'; vc.write_json(generator,data)
        with self.assertRaisesRegex(ValueError,'toolchain changed'): vc.publish(asset,base=2,patch={'set':{'detail':'low'}})
