/* Optional development tooling. See tests/README.md; no browser runtime dependency. */
const {chromium} = (()=>{try{return require('playwright');}catch{return require('playwright-core');}})();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.test-output/browser');
fs.mkdirSync(output, {recursive:true});
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'visual-browser-')));
const python = process.env.PYTHON || 'python3';
function run(...args){return execFileSync(python, [path.join(root,'tools/visual.py'), ...args], {encoding:'utf8'});}
async function main(){
 let server, browser;
 try{
  run('init','web-app','--out',path.join(temporary,'app'));
  run('init','component-kit','--out',path.join(temporary,'app/kit'));
  run('create',path.join(root,'presets/robot.json'),'--out',path.join(temporary,'app/assets/robot'));
  run('generate','ship','--seed','42','--out',path.join(temporary,'app/assets/ship'));
  const terrainRecipe=path.join(temporary,'terrain.json');
  fs.writeFileSync(terrainRecipe,run('terrain','template','meadow'));
  run('terrain','create',terrainRecipe,'--out',path.join(temporary,'app/meadow'));
  fs.cpSync(path.join(root,'examples/terrain-viewer'),path.join(temporary,'app/terrain-viewer'),{recursive:true});
  fs.cpSync(path.join(root,'examples/basecoat-catalog'),path.join(temporary,'app/examples/basecoat-catalog'),{recursive:true});
  fs.cpSync(path.join(root,'vendor/basecoat/dist'),path.join(temporary,'app/vendor/basecoat/dist'),{recursive:true});
  const code='import http.server, functools\ns=http.server.ThreadingHTTPServer(("127.0.0.1",0), functools.partial(http.server.SimpleHTTPRequestHandler,directory='+JSON.stringify(path.join(temporary,'app'))+'))\nprint(s.server_port,flush=True)\ns.serve_forever()';
  server=spawn(python,['-u','-c',code],{stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',d=>stderr+=d);
  const port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Server start timeout: '+stderr)),10000);server.stdout.on('data',d=>{text+=d;if(text.includes('\n')){clearTimeout(timer);resolve(Number(text.trim()));}});server.on('error',reject);server.on('exit',c=>{if(c)reject(new Error(stderr));});});
  browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}}), page=await context.newPage();
  const externalRequests=[];
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();
    externalRequests.push(route.request().url());return route.abort();
  });
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${port}`;
  await page.goto(base);await page.waitForSelector('#empty:visible');
  assert.equal(await page.locator('#projects article').count(),0);
  await page.keyboard.press('Tab');assert.equal(await page.locator('.vc-skip').evaluate(el=>el===document.activeElement),true);
  await page.locator('#new').click();await page.locator('#title').waitFor({state:'visible'});
  assert.equal(await page.locator('#title').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#dialog').evaluate(el=>el.open),false);
  await page.locator('#new').click();await page.locator('#title').fill('   ');await page.locator('button[type=submit]').click();
  assert.equal(await page.locator('#dialog').evaluate(el=>el.open),true);
  await page.locator('#title').fill('Pocket garden');await page.locator('#description').fill('Sketch the first three little plants.');await page.locator('button[type=submit]').click();
  await page.locator('#projects article').waitFor();
  assert.match(await page.locator('#new').evaluate(el=>getComputedStyle(el).display),/^(inline-)?flex$/);
  await page.locator('#new').click();await page.locator('#title').fill('Robot companion');await page.locator('#description').fill('Draw a friendly idle animation.');await page.locator('button[type=submit]').click();
  assert.equal(await page.locator('#projects article').count(),2);
  await page.getByRole('button',{name:'Complete Pocket garden',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Reopen Pocket garden',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.locator('#filter').selectOption('done');assert.equal(await page.locator('#projects article').count(),1);
  await page.locator('#filter').selectOption('all');await page.locator('#search').fill('robot');assert.equal(await page.locator('#projects article').count(),1);
  await page.locator('#search').fill('missing');assert.equal(await page.locator('#empty').isVisible(),true);
  await page.locator('#search').fill('');await page.reload();await page.waitForSelector('#projects article');
  assert.equal(await page.locator('#projects article').count(),2);
  assert.equal(await page.getByRole('button',{name:'Reopen Pocket garden',exact:true}).count(),1);
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:360,height:800});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  // A 640 CSS-pixel viewport exercises a 1280 px view at 200% browser zoom/reflow.
  await page.setViewportSize({width:640,height:450});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  await page.locator('#new').click();await page.locator('#title').fill('<img src=x onerror=alert(1)>');await page.locator('button[type=submit]').click();
  assert.equal(await page.locator('#projects img').count(),0);assert.equal(await page.locator('#projects h2').first().textContent(),'<img src=x onerror=alert(1)>');
  await page.goto(`${base}/assets/robot/0001/preview.html`);
  await page.locator('img').first().evaluate(async img=>{await img.decode();});
  assert.equal(await page.locator('img').first().evaluate(img=>img.naturalWidth),32);
  await page.screenshot({path:path.join(output,'robot.png'),fullPage:true});
  await page.goto(`${base}/assets/ship/0001/preview.html`);
  await page.locator('img').first().evaluate(async img=>{await img.decode();});
  assert.equal(await page.locator('img').first().evaluate(img=>img.naturalWidth),12);
  await page.screenshot({path:path.join(output,'ship.png'),fullPage:true});
  await page.setViewportSize({width:1280,height:1000});
  await page.goto(`${base}/kit/`);
  await page.waitForFunction(()=>document.querySelector('#kit-tabs').dataset.tabsInitialized);
  await page.locator('#overview-tab').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#details-tab').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#details-panel').isVisible(),true);
  await page.keyboard.press('Home');assert.equal(await page.locator('#overview-tab').getAttribute('aria-selected'),'true');
  await page.locator('#note').fill('Use the local component recipe');await page.getByRole('button',{name:'Keep this note',exact:true}).click();
  assert.equal(await page.locator('#note-status').textContent(),'For this session: Use the local component recipe');
  await page.locator('#open-dialog').click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#example-dialog').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#open-dialog').evaluate(el=>el===document.activeElement),true);
  await page.screenshot({path:path.join(output,'components.png'),fullPage:true});
  await page.setViewportSize({width:360,height:800});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'components-mobile.png'),fullPage:true});
  await page.goto(`${base}/terrain-viewer/`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  assert.equal(await page.evaluate(async()=>{
    const actual=document.querySelector('canvas'),context=actual.getContext('2d');
    const expected=new Image();expected.src='../meadow/0001/preview-native.png';await expected.decode();
    const scratch=document.createElement('canvas');scratch.width=expected.width;scratch.height=expected.height;
    scratch.getContext('2d').drawImage(expected,0,0);
    const a=context.getImageData(0,0,actual.width,actual.height).data;
    const b=scratch.getContext('2d').getImageData(0,0,scratch.width,scratch.height).data;
    return a.length===b.length&&a.every((value,index)=>value===b[index]);
  }),true,'Manifest consumer must reproduce exported specimen pixels');
  await page.screenshot({path:path.join(output,'terrain.png'),fullPage:true});
  const componentCatalog=JSON.parse(fs.readFileSync(path.join(root,'examples/basecoat-catalog/catalog.json')));
  assert.equal(componentCatalog.components.length,41);
  for(const component of componentCatalog.components){
    await page.goto(`${base}/examples/basecoat-catalog/${component.demo}`);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#demo').count(),1);
    assert.ok((await page.locator('pre').textContent()).length>0);
    const images=await page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0));
    assert.equal(images,true,component.id+' images must load locally');
  }
  await page.goto(`${base}/examples/basecoat-catalog/components/toast.html`);
  await page.getByRole('button',{name:'Toast from front-end'}).click();
  await page.waitForSelector('#toaster .toast');
  await page.goto(`${base}/examples/basecoat-catalog/`);
  await page.screenshot({path:path.join(output,'basecoat-catalog.png'),fullPage:true});
  assert.deepEqual(externalRequests,[],'Starters must not request CDNs, remote fonts or services');
  assert.deepEqual(errors,[]);
  console.log('Offline Basecoat/starter/asset behavior passed. Review screenshots separately for appearance.');
 }finally{
  if(browser)await browser.close();if(server)server.kill();fs.rmSync(temporary,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
