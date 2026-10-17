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
  run('create',path.join(root,'presets/robot.json'),'--out',path.join(temporary,'app/assets/robot'));
  const code='import http.server, functools\ns=http.server.ThreadingHTTPServer(("127.0.0.1",0), functools.partial(http.server.SimpleHTTPRequestHandler,directory='+JSON.stringify(path.join(temporary,'app'))+'))\nprint(s.server_port,flush=True)\ns.serve_forever()';
  server=spawn(python,['-u','-c',code],{stdio:['ignore','pipe','pipe']});
  let stderr='';server.stderr.on('data',d=>stderr+=d);
  const port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(new Error('Server start timeout: '+stderr)),10000);server.stdout.on('data',d=>{text+=d;if(text.includes('\n')){clearTimeout(timer);resolve(Number(text.trim()));}});server.on('error',reject);server.on('exit',c=>{if(c)reject(new Error(stderr));});});
  browser=await chromium.launch({headless:true,...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}}), page=await context.newPage();
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
  assert.deepEqual(errors,[]);
  console.log('Browser behavior passed. Review desktop.png, mobile.png and robot.png separately for appearance.');
 }finally{
  if(browser)await browser.close();if(server)server.kill();fs.rmSync(temporary,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
