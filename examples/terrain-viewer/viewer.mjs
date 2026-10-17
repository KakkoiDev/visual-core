const directory='../meadow/0001/';
const read=async name=>{const r=await fetch(directory+name);if(!r.ok)throw Error(`Cannot load ${name}`);return r.json();};
const image=async name=>{const img=new Image();img.src=directory+name;await img.decode();return img;};
try {
 const [manifest,specimen,atlas,base]=await Promise.all([read('manifest.json'),read('specimen.json'),image('atlas.png'),image('base.png')]);
 const canvas=document.querySelector('canvas'),size=manifest.tile_size;
 canvas.width=specimen.width*size;canvas.height=specimen.height*size;
 const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
 for(let y=0;y<specimen.height;y++)for(let x=0;x<specimen.width;x++)context.drawImage(base,x*size,y*size);
 const lookup=new Map(manifest.tiles.map(t=>[`${t.mask}:${t.variant}`,t]));
 for(const cell of specimen.cells){const t=lookup.get(`${cell.mask}:${cell.variant}`);if(!t)throw Error('Missing terrain mask');context.drawImage(atlas,t.x,t.y,t.width,t.height,cell.x*size,cell.y*size,size,size);}
 document.querySelector('#status').textContent=`${manifest.tiles.length} stable tile IDs; nearest filtering; mipmaps off.`;
 document.body.dataset.ready='true';
}catch(error){document.querySelector('#status').textContent=error.message;throw error;}
