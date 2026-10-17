/* Thin geometry adapter for the unmodified, vendored Pixel Sprite Generator.
 * Only this trusted source is evaluated. User input is JSON, never JavaScript.
 * Browser-only render hooks are bypassed; mask sampling, mirroring and edges are
 * upstream. Colors and file export belong to visual-core's existing renderer. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 256000) { console.error('Input exceeds 256 KB'); process.exit(1); }
});
process.stdin.on('end', () => {
  try {
    const config = JSON.parse(input);
    const masks = JSON.parse(fs.readFileSync(path.join(root, 'presets/generators/masks.json'), 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        Object.keys(config).some(key => !['name','mask','seed','palette'].includes(key)) ||
        typeof config.name !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(config.name) ||
        !Object.hasOwn(masks, config.mask) || !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 4294967295 ||
        !config.palette || Object.keys(config.palette).sort().join('') !== '012' ||
        Object.values(config.palette).some(value => typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value))) {
      throw new Error('Use name, a catalog mask, uint32 seed and palette keys 0/1/2 with #RRGGBB colors');
    }
    let state = config.seed >>> 0;
    const math = Object.create(Math);
    // Mulberry32: seeded adapter randomness, scoped to this fresh upstream VM.
    math.random = () => {
      let value = state += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    const context = {window: {}, Math: math};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'vendor/pixel-sprite-generator/pixel-sprite-generator.js'), 'utf8'), context, {timeout:1000});
    const {Mask, Sprite} = context.window.psg;
    Sprite.prototype.initCanvas = () => {};
    Sprite.prototype.initContext = () => {};
    Sprite.prototype.renderPixelData = () => {};
    const mask = masks[config.mask];
    const sprite = new Sprite(new Mask(mask.data.slice(), mask.width, mask.height, mask.mirrorX, mask.mirrorY));
    const rows = [];
    for (let y = 0; y < sprite.height; y++) {
      let row = '';
      for (let x = 0; x < sprite.width; x++) {
        const value = sprite.data[y * sprite.width + x];
        row += value === 0 ? '.' : value < 0 ? '0' : y < sprite.height / 3 ? '2' : '1';
      }
      rows.push(row);
    }
    process.stdout.write(JSON.stringify({name:config.name, kind:'pixel', width:sprite.width, height:sprite.height,
      palette:config.palette, frames:[{id:'idle', rows, ms:240}]}));
  } catch (error) {
    console.error(error.message);process.exitCode = 1;
  }
});
