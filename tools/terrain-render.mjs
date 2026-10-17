// Constrained adapter over the pinned upstream renderer. JSON data only.
import { createRequire } from 'node:module';
import { createBlankRecipe } from '../vendor/tesserae/dist/types.js';
import { renderTilePixels } from '../vendor/tesserae/dist/engine/render.js';
import { BIT, getBlobMasks, blobAtlasCoords, maskFromGrid, compatibleHorizontal, compatibleVertical } from '../vendor/tesserae/dist/engine/blob47.js';
const require = createRequire(import.meta.url);
const alea = require('../vendor/alea');
const { createNoise4D } = require('../vendor/simplex-noise/dist/cjs/simplex-noise.js');
let input = ''; for await (const chunk of process.stdin) input += chunk;
const { spec, palette } = JSON.parse(input);
const size = spec.tile_size, count = spec.variants;
const rgb = palette.map(c => [1,3,5].map(i => parseInt(c.slice(i,i+2),16)));
const recipe = createBlankRecipe(spec.id);
Object.assign(recipe.shape, { tileSize:size, seed:spec.seed, outerRadius:spec.contour.profile === 'soft' ? .5 : 0,
  innerRadius:spec.contour.profile === 'soft' ? .5 : 0 });
const surface = recipe.layers.find(l => l.id === 'surface');
Object.assign(surface, {color:palette[1], accent:palette[1], pattern:{meadow:'organic',coast:'sand',dungeon:'rock'}[spec.preset], roughness:0});
const border = recipe.layers.find(l => l.id === 'inner-border');
Object.assign(border, { color:palette[0], accent:palette[0], width:spec.contour.border_px / size });
const nearest = p => rgb.slice(0,3).reduce((best,c,i) => {
  const distance = c.reduce((sum,v,k) => sum+(v-p[k])**2,0);
  return distance < best.distance ? {index:i,distance} : best;
}, {index:0,distance:Infinity}).index;
const textures = new Map(), masks=getBlobMasks(), tiles=new Map();
const noise = createNoise4D(alea(`terrain-v1:${spec.seed}`));
function material(x,y,variant,offset) {
  const u=(x === size-1 ? 0 : x/(size-1))*Math.PI*2;
  const v=(y === size-1 ? 0 : y/(size-1))*Math.PI*2;
  return noise(Math.cos(u)*2+offset+variant*11,Math.sin(u)*2,Math.cos(v)*2,Math.sin(v)*2);
}
const base=Buffer.alloc(size*size*4);
for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
  const field=material(x,y,0,37), index=field<-.18?3:field>.25?5:4;
  base.set([...rgb[index],255],(y*size+x)*4);
}
for(const mask of masks) {
  const raw=renderTilePixels(recipe,mask,size,textures,0);
  for(let variant=0;variant<count;variant++) {
    const pixels=Buffer.alloc(raw.length);
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const p=(y*size+x)*4;
      if(raw[p+3]<128) continue;
      let index=nearest(raw.subarray(p,p+3));
      // Interior-only flecks change by variant; final seam ring stays untouched.
      if(x>1 && y>1 && x<size-2 && y<size-2 && index!==0) {
        const value=material(x,y,variant,0), threshold={low:.55,medium:.32,high:.12}[spec.detail];
        if(value>threshold) index=2;
        else if(value< -threshold) index=1;
      }
      pixels.set([...rgb[index],255],p);
    }
    tiles.set(`${mask}:${variant}`,pixels);
  }
}
let testedPairs=0;
for(const a of masks) for(const b of masks) for(const horizontal of [true,false]) {
  if(!(horizontal?compatibleHorizontal(a,b):compatibleVertical(a,b))) continue;
  for(let av=0;av<count;av++) for(let bv=0;bv<count;bv++) {
    const first=tiles.get(`${a}:${av}`),second=tiles.get(`${b}:${bv}`);
    for(let o=0;o<size;o++) {
      const i=horizontal?(o*size+size-1)*4:((size-1)*size+o)*4;
      const j=horizontal?o*size*4:o*4;
      for(let c=0;c<4;c++) if(first[i+c]!==second[j+c]) throw Error(`Seam failed ${a}/${b}/${av}/${bv}`);
    }
    testedPairs++;
  }
}
const width=12*size,height=4*size*count,atlas=Buffer.alloc(width*height*4),entries=[];
const blit=(target,targetWidth,pixels,x,y) => {
  for(let row=0;row<size;row++) target.set(pixels.subarray(row*size*4,(row+1)*size*4),((y+row)*targetWidth+x)*4);
};
for(const mask of masks) for(let variant=0;variant<count;variant++) {
  const pos=blobAtlasCoords(mask),x=pos.x*size,y=(pos.y+variant*4)*size;
  blit(atlas,width,tiles.get(`${mask}:${variant}`),x,y);
  entries.push({id:`${spec.id}/blob47/${mask}/v${variant}`,mask,variant,x,y,width:size,height:size});
}
const mapWidth=24,mapHeight=16,grid=Array.from({length:mapHeight},(_,y)=>Array.from({length:mapWidth},(_,x)=>
  (x>1&&x<13&&y>1&&y<13&&!(x>5&&x<9&&y>5&&y<9)) ||
  (x===17&&y>1&&y<14)||(y===8&&x>13&&x<23)||
  (x>19&&y>10&&x<23&&y<15)));
const preview=Buffer.alloc(mapWidth*size*mapHeight*size*4),cells=[];
for(let y=0;y<mapHeight;y++) for(let x=0;x<mapWidth;x++) {
  blit(preview,mapWidth*size,base,x*size,y*size);
  if(!grid[y][x]) continue;
  const mask=maskFromGrid(grid,x,y),variant=Math.floor(alea(`placement:${spec.seed}:${x}:${y}`)()*count);
  const foreground=tiles.get(`${mask}:${variant}`);
  for(let ty=0;ty<size;ty++) for(let tx=0;tx<size;tx++) {
    const from=(ty*size+tx)*4,to=((y*size+ty)*mapWidth*size+x*size+tx)*4;
    if(foreground[from+3]) preview.set(foreground.subarray(from,from+4),to);
  }
  cells.push({x,y,mask,variant});
}
for(let o=0;o<size;o++) for(let c=0;c<4;c++) {
  if(base[(o*size)*4+c]!==base[(o*size+size-1)*4+c] || base[o*4+c]!==base[((size-1)*size+o)*4+c]) throw Error('Base repeat seam failed');
}
const outputs={atlas:{width,height,rgba:atlas.toString('base64')},base:{width:size,height:size,rgba:base.toString('base64')},
  'preview-native':{width:mapWidth*size,height:mapHeight*size,rgba:preview.toString('base64')}};
console.log(JSON.stringify({recipe,outputs,tiles:entries,bitOrder:BIT,cells,
  quality:{passed:true,compatible_pair_checks:testedPairs,rgba_edge_delta:0,base_repeat:true,palette_colors:rgb.length,binary_alpha:true}}));
