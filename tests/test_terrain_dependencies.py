"""Exercise actual pinned upstream code with no package installation."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from vendor import check


class TerrainDependencyTests(unittest.TestCase):
    def test_headless_upstream_probe(self):
        check()
        result = subprocess.run(
            ['node', str(ROOT / 'tests/terrain-dependencies.cjs')],
            cwd=ROOT, capture_output=True, text=True, timeout=30, check=True)
        report = json.loads(result.stdout)
        self.assertTrue(report['networkBlocked'])
        expected = {
            'blob47': (47, 376, '456f73d80e619ef4637edf044866f9af7e899b14411170f5ab79870fb3db14db'),
            'dual16': (16, 512, '236a9b45a1ba60069e77fce3f185210cd805c7fe8c4236d7a914dfa34b689628'),
        }
        for terrain in report['tesserae']:
            states, pairs, pixel_hash = expected[terrain['topology']]
            self.assertEqual(terrain['states'], states)
            self.assertEqual(terrain['rgbaCompatiblePairChecks'], pairs)
            self.assertEqual(terrain['pixelSha256'], pixel_hash)
            self.assertTrue(terrain['strictSeamsPass'])
            self.assertTrue(terrain['pngRoundTrip'])
        self.assertTrue(all(report['patch'].values()))
        self.assertTrue(report['noise']['periodic16x8'])


if __name__ == '__main__':
    unittest.main()
