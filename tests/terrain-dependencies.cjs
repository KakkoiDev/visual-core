// Headless dependency probe, not the proposed terrain CLI or a finished preset.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
// Fail immediately if a gathered dependency tries to access the network.
const denyNetwork = () => { throw new Error('Network disabled in terrain dependency probe'); };
require('node:net').Socket.prototype.connect = denyNetwork;
for (const protocol of ['node:http', 'node:https']) {
  require(protocol).request = denyNetwork;
  require(protocol).get = denyNetwork;
}
globalThis.fetch = denyNetwork;
const root = path.resolve(__dirname, '..');
const { PNG } = require('../vendor/pngjs');
const alea = require('../vendor/alea');
const { createNoise4D } = require('../vendor/simplex-noise/dist/cjs/simplex-noise.js');
const patch = require('../vendor/fast-json-patch');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const load = name => import(pathToFileURL(path.join(root, 'vendor/tesserae/dist', name)).href);

function edgeDelta(first, second, size, horizontal) {
  let maximum = 0;
  for (let offset = 0; offset < size; offset++) {
    const a = horizontal ? (offset * size + size - 1) * 4 : ((size - 1) * size + offset) * 4;
    const b = horizontal ? offset * size * 4 : offset * 4;
    for (let channel = 0; channel < 4; channel++)
      maximum = Math.max(maximum, Math.abs(first[a + channel] - second[b + channel]));
  }
  return maximum;
}

async function main() {
  const { createBlankRecipe } = await load('types.js');
  const { getTerrainMasks, terrainAtlasCoords, terrainAtlasLayout } = await load('engine/topology.js');
  const { renderTilePixels } = await load('engine/render.js');
  const { compatibleHorizontal, compatibleVertical } = await load('engine/blob47.js');
  const dual = await load('engine/dual16.js');
  const { analyzeSeams } = await load('engine/seams.js');
  const { canonicalRecipeJson, diffRecipes } = await load('engine/recipeFormat.js');
  const { buildManifest, buildGodotImporter } = await load('engine/export.js');
  const recipes = [];
  let preview;
  for (const topology of ['blob47', 'dual16']) {
    const recipe = createBlankRecipe(`Dependency probe ${topology}`);
    recipe.topology = topology;
    recipe.shape.tileSize = 16;
    recipe.variants.count = 2;
    recipe.variants.weights = [50, 50];
    const masks = getTerrainMasks(recipe);
    assert.equal(new Set(masks).size, topology === 'blob47' ? 47 : 16);
    const rendered = new Map();
    const layout = terrainAtlasLayout(recipe);
    const width = layout.columns * 16, height = layout.rows * 16 * 2;
    const atlas = Buffer.alloc(width * height * 4);
    let nonTransparent = 0;
    for (const [index, mask] of masks.entries()) {
      for (let variant = 0; variant < 2; variant++) {
        const pixels = renderTilePixels(recipe, mask, 16, new Map(), variant);
        assert.equal(pixels.length, 16 * 16 * 4);
        assert.deepEqual(pixels, renderTilePixels(structuredClone(recipe), mask, 16, new Map(), variant));
        rendered.set(`${mask}:${variant}`, pixels);
        const rect = terrainAtlasCoords(recipe, mask, index);
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const from = (y * 16 + x) * 4;
          const to = (((variant * layout.rows + rect.y) * 16 + y) * width + rect.x * 16 + x) * 4;
          atlas.set(pixels.subarray(from, from + 4), to);
          if (pixels[from + 3]) nonTransparent++;
        }
      }
    }
    assert.ok(nonTransparent > 0, 'Probe must contain visible output');
    const matchH = topology === 'blob47' ? compatibleHorizontal : dual.compatibleDualHorizontal;
    const matchV = topology === 'blob47' ? compatibleVertical : dual.compatibleDualVertical;
    let pairs = 0, maximum = 0, corruptPair;
    for (const a of masks) for (const b of masks) for (const horizontal of [true, false]) {
      if (!(horizontal ? matchH(a,b) : matchV(a,b))) continue;
      for (let av = 0; av < 2; av++) for (let bv = 0; bv < 2; bv++) {
        const first = rendered.get(`${a}:${av}`), second = rendered.get(`${b}:${bv}`);
        maximum = Math.max(maximum, edgeDelta(first, second, 16, horizontal));
        pairs++;
        if (horizontal && !corruptPair) corruptPair = [first, second];
      }
    }
    const first = new Uint8ClampedArray(corruptPair[0]);
    const alpha = (16 - 1) * 4 + 3;
    first[alpha] = corruptPair[1][3] === 255 ? 0 : 255;
    assert.ok(edgeDelta(first, corruptPair[1], 16, true) > 0, 'Detect alpha-only seam corruption');
    const encoded = PNG.sync.write({ width, height, data: atlas });
    const decoded = PNG.sync.read(encoded);
    assert.equal(decoded.width, width); assert.equal(decoded.height, height);
    assert.deepEqual(decoded.data, atlas);
    const manifest = buildManifest(recipe);
    assert.equal(manifest.topology, topology);
    const importer = buildGodotImporter(recipe);
    assert.ok(importer.length > 0);
    assert.deepEqual(diffRecipes(recipe, structuredClone(recipe)), []);
    assert.equal(canonicalRecipeJson(recipe), canonicalRecipeJson(structuredClone(recipe)));
    const upstream = analyzeSeams(recipe, new Map(), 16, 'albedo');
    recipes.push({ topology, tileSize: 16, variants: 2, states: masks.length,
      rgbaCompatiblePairChecks: pairs, maximumRgbaEdgeDelta: maximum,
      strictSeamsPass: maximum === 0, upstreamPairChecks: upstream.testedPairs,
      upstreamMaximumRgbDelta: upstream.maximum, pixelSha256: digest(atlas),
      pngRoundTrip: true, godotImporterGenerated: true, godotImportExecuted: false });
    if (topology === 'blob47') preview = encoded;
  }
  const noise = seed => createNoise4D(alea(seed));
  const periodic = (sample, x, y, w, h) => {
    const u = (((x % w) + w) % w) / w * Math.PI * 2;
    const v = (((y % h) + h) % h) / h * Math.PI * 2;
    return sample(Math.cos(u) * w/h, Math.sin(u) * w/h, Math.cos(v), Math.sin(v));
  };
  const a = noise('material:42'), b = noise('material:42'), c = noise('material:43');
  const values = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    const value = periodic(a,x,y,16,8); values.push(value);
    assert.equal(value, periodic(b,x,y,16,8));
    assert.equal(value, periodic(a,x+16,y,16,8));
    assert.equal(value, periodic(a,x,y+8,16,8));
  }
  assert.notEqual(values[0], periodic(c,0,0,16,8));
  const original = { seed: 42, palette: 'warm', layers: { surface: { detail: 'medium' } } };
  const revised = patch.applyPatch(original, [{op:'replace',path:'/layers/surface/detail',value:'low'}], true, false, true).newDocument;
  assert.equal(revised.seed,42); assert.equal(original.layers.surface.detail,'medium');
  assert.equal(revised.layers.surface.detail,'low');
  assert.throws(() => patch.applyPatch({}, [{op:'add',path:'/__proto__/polluted',value:true}],true,false,true));
  const report = { schemaVersion: 1, purpose: 'Dependency extraction probe; not a production terrain generator',
    node: process.version, networkRequired: false, networkBlocked: true, nativeAddonsRequired: false,
    tesserae: recipes, noise: { reproducible: true, seedSensitive: true,
      periodic16x8: true, samples: values.length },
    patch: { sourcePreserved: true, seedPreserved: true, prototypeWriteRejected: true },
    limitations: ['Only blank upstream fixtures tested; no curated material recipe acceptance.',
      'Godot importer generated but not imported in Godot.',
      'No cross-platform run or weak-model evaluation.',
      'Upstream seam metric ignores alpha and checks variant zero outside artistic mode.'] };
  if (process.argv[2]) {
    fs.mkdirSync(process.argv[2], { recursive: true });
    fs.writeFileSync(path.join(process.argv[2], 'report.json'), JSON.stringify(report,null,2)+'\n');
    fs.writeFileSync(path.join(process.argv[2], 'blob47-probe.png'), preview);
  }
  console.log(JSON.stringify(report,null,2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
