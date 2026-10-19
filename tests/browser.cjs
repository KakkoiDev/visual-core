/* Optional development tooling. See tests/README.md; no browser runtime dependency.
   One test per browser scenario in SCENARIOS.md, named exactly after its title. Each test gets a fresh browser context
   (its own storage) with every non-local request blocked and recorded; results go to .test-output/browser-junit.xml. */
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
/* Headless Chromium on macOS asks for a keychain without these (test-core lesson); harmless elsewhere. */
const CHROMIUM_ARGS = ['--use-mock-keychain', '--password-store=basic'];
function run(...args){return execFileSync(python, [path.join(root,'tools/visual.py'), ...args], {encoding:'utf8'});}

const tests = [];
function test(title, body){tests.push({title, body});}

const isFocused = locator => locator.evaluate(el => el === document.activeElement);
const fitsWidth = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function addProject(page, title, nextStep){
  await page.getByRole('button', {name:'New project', exact:true}).click();
  await page.getByLabel('Project name').fill(title);
  if(nextStep !== undefined) await page.getByLabel('Next step').fill(nextStep);
  await page.getByRole('button', {name:'Create project', exact:true}).click();
}

async function boardWithTwoProjects(page, base){
  await page.goto(base);
  await page.locator('#empty').waitFor({state:'visible'});
  await addProject(page, 'Pocket garden', 'Sketch the first three little plants.');
  await addProject(page, 'Robot companion', 'Draw a friendly idle animation.');
  await page.locator('#projects article').nth(1).waitFor();
}

test('Add, complete, find and filter projects on the board', async ({page, base}) => {
  // Given a new web app board served locally
  await page.goto(base);
  await page.locator('#empty').waitFor({state:'visible'});
  assert.equal(await page.locator('#projects article').count(), 0);
  await page.keyboard.press('Tab');
  assert.equal(await isFocused(page.getByRole('link', {name:'Skip to projects'})), true);
  await page.getByRole('button', {name:'Create a project', exact:true}).click();
  await page.getByLabel('Project name').waitFor({state:'visible'});
  assert.equal(await isFocused(page.getByLabel('Project name')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dialog').evaluate(el => el.open), false);
  await page.getByRole('button', {name:'New project', exact:true}).click();
  await page.getByRole('button', {name:'Cancel', exact:true}).click();
  assert.equal(await page.locator('#dialog').evaluate(el => el.open), false);
  // When I create two projects (a blank name keeps the dialog open), complete one, filter, search and reload
  await page.getByRole('button', {name:'New project', exact:true}).click();
  await page.getByLabel('Project name').fill('   ');
  await page.getByRole('button', {name:'Create project', exact:true}).click();
  assert.equal(await page.locator('#dialog').evaluate(el => el.open), true);
  await page.getByLabel('Project name').fill('Pocket garden');
  await page.getByLabel('Next step').fill('Sketch the first three little plants.');
  await page.getByRole('button', {name:'Create project', exact:true}).click();
  await page.locator('#projects article').waitFor();
  assert.match(await page.getByRole('button', {name:'New project', exact:true}).evaluate(el => getComputedStyle(el).display), /^(inline-)?flex$/);
  await addProject(page, 'Robot companion', 'Draw a friendly idle animation.');
  // Then the board shows the right projects each time and keeps them after the reload
  assert.equal(await page.locator('#projects article').count(), 2);
  await page.getByRole('button', {name:'Complete Pocket garden', exact:true}).click(); // e2e-coverage: ignore rendered per project by app.js
  assert.equal(await isFocused(page.getByRole('button', {name:'Reopen Pocket garden', exact:true})), true); // e2e-coverage: ignore rendered per project by app.js
  await page.getByLabel('Show').selectOption('done');
  assert.equal(await page.locator('#projects article').count(), 1);
  await page.getByLabel('Show').selectOption('all');
  await page.getByPlaceholder('Search by name').fill('robot');
  assert.equal(await page.locator('#projects article').count(), 1);
  await page.getByPlaceholder('Search by name').fill('missing');
  assert.equal(await page.locator('#empty').isVisible(), true);
  await page.getByPlaceholder('Search by name').fill('');
  await page.reload();
  await page.locator('#projects article').nth(1).waitFor();
  assert.equal(await page.locator('#projects article').count(), 2);
  assert.equal(await page.getByRole('button', {name:'Reopen Pocket garden', exact:true}).count(), 1); // e2e-coverage: ignore rendered per project by app.js
  await page.screenshot({path:path.join(output,'desktop.png'), fullPage:true});
});

test('The board stays usable on a phone, at 200% zoom and with reduced motion', async ({page, base}) => {
  // Given the board with two projects
  await boardWithTwoProjects(page, base);
  // When I view it 360 and 640 pixels wide with reduced motion
  await page.setViewportSize({width:360, height:800});
  // Then nothing scrolls sideways and reduced motion is reported
  assert.equal(await fitsWidth(page), true);
  await page.screenshot({path:path.join(output,'mobile.png'), fullPage:true});
  // A 640 CSS-pixel viewport exercises a 1280 px view at 200% browser zoom/reflow.
  await page.setViewportSize({width:640, height:450});
  assert.equal(await fitsWidth(page), true);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
});

test('Project names are shown as text, never as markup', async ({page, base}) => {
  await page.goto(base);
  await page.locator('#empty').waitFor({state:'visible'});
  await addProject(page, '<img src=x onerror=alert(1)>');
  await page.locator('#projects article').waitFor();
  assert.equal(await page.locator('#projects img').count(), 0);
  assert.equal(await page.locator('#projects h2').first().textContent(), '<img src=x onerror=alert(1)>');
});

test('Sprite previews show the art at native size', async ({page, base}) => {
  for(const [asset, width] of [['robot', 32], ['ship', 12]]){
    await page.goto(`${base}/assets/${asset}/0001/preview.html`);
    await page.locator('img').first().evaluate(async img => {await img.decode();});
    assert.equal(await page.locator('img').first().evaluate(img => img.naturalWidth), width, asset);
    await page.screenshot({path:path.join(output,`${asset}.png`), fullPage:true});
  }
});

test('Use the form, tabs and dialog in the component kit', async ({page, base}) => {
  // Given the component kit served locally
  await page.setViewportSize({width:1280, height:1000});
  await page.goto(`${base}/kit/`);
  await page.waitForFunction(() => document.querySelector('#kit-tabs').dataset.tabsInitialized);
  await page.keyboard.press('Tab');
  assert.equal(await isFocused(page.getByRole('link', {name:'Skip to components'})), true);
  // When I switch tabs with the keyboard, keep a note and open and close the dialog
  await page.getByRole('tab', {name:'Overview'}).focus();
  await page.keyboard.press('ArrowRight');
  // Then the selected tab, the note status and the focus follow
  assert.equal(await page.getByRole('tab', {name:'Details'}).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#details-panel').isVisible(), true);
  await page.keyboard.press('Home');
  assert.equal(await page.getByRole('tab', {name:'Overview'}).getAttribute('aria-selected'), 'true');
  await page.getByPlaceholder('Describe one useful task').fill('Use the local component recipe');
  await page.getByRole('button', {name:'Keep this note', exact:true}).click();
  assert.equal(await page.locator('#note-status').textContent(), 'For this session: Use the local component recipe');
  await page.getByRole('button', {name:'Open example'}).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#example-dialog').evaluate(el => el.open), false);
  assert.equal(await isFocused(page.getByRole('button', {name:'Open example'})), true);
  await page.getByRole('button', {name:'Open example'}).click();
  await page.getByRole('button', {name:'Close example'}).click();
  assert.equal(await page.locator('#example-dialog').evaluate(el => el.open), false);
  await page.screenshot({path:path.join(output,'components.png'), fullPage:true});
  await page.setViewportSize({width:360, height:800});
  assert.equal(await fitsWidth(page), true);
  await page.screenshot({path:path.join(output,'components-mobile.png'), fullPage:true});
});

test('The terrain viewer redraws the exported pixels', async ({page, base}) => {
  await page.goto(`${base}/terrain-viewer/`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  assert.equal(await page.evaluate(async () => {
    const actual = document.querySelector('canvas'), context = actual.getContext('2d');
    const expected = new Image(); expected.src = '../meadow/0001/preview-native.png'; await expected.decode();
    const scratch = document.createElement('canvas'); scratch.width = expected.width; scratch.height = expected.height;
    scratch.getContext('2d').drawImage(expected, 0, 0);
    const a = context.getImageData(0, 0, actual.width, actual.height).data;
    const b = scratch.getContext('2d').getImageData(0, 0, scratch.width, scratch.height).data;
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }), true, 'Manifest consumer must reproduce exported specimen pixels');
  await page.screenshot({path:path.join(output,'terrain.png'), fullPage:true});
});

test('Every Basecoat catalog page opens offline', async ({page, base}) => {
  const componentCatalog = JSON.parse(fs.readFileSync(path.join(root,'examples/basecoat-catalog/catalog.json')));
  assert.equal(componentCatalog.components.length, 41);
  for(const component of componentCatalog.components){
    /* The load event waits for the page's images; no network-idle guess. */
    await page.goto(`${base}/examples/basecoat-catalog/${component.demo}`, {waitUntil:'load'});
    assert.equal(await page.locator('#demo').count(), 1);
    assert.ok((await page.locator('pre').textContent()).length > 0);
    const images = await page.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0));
    assert.equal(images, true, component.id + ' images must load locally');
  }
  await page.goto(`${base}/examples/basecoat-catalog/components/toast.html`);
  await page.getByRole('button', {name:'Toast from front-end'}).click(); // e2e-coverage: ignore catalog demo page, outside the starters' control list
  await page.waitForSelector('#toaster .toast');
  await page.goto(`${base}/examples/basecoat-catalog/`);
  await page.screenshot({path:path.join(output,'basecoat-catalog.png'), fullPage:true});
});

function junit(results){
  const esc = text => String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const failures = results.filter(r => r.error).length;
  const cases = results.map(r => `  <testcase classname="browser" name="${esc(r.title)}" time="${(r.ms/1000).toFixed(3)}">`
    + (r.error ? `<failure message="${esc(r.error.message.split('\n')[0])}">${esc(r.error.stack || r.error)}</failure>` : '')
    + '</testcase>');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="browser" tests="${results.length}" failures="${failures}">\n${cases.join('\n')}\n</testsuite>\n`;
}

async function main(){
  let server, browser;
  const results = [];
  try{
    run('init','web-app','--out',path.join(temporary,'app'));
    run('init','component-kit','--out',path.join(temporary,'app/kit'));
    run('create',path.join(root,'presets/robot.json'),'--out',path.join(temporary,'app/assets/robot'));
    run('generate','ship','--seed','42','--out',path.join(temporary,'app/assets/ship'));
    const terrainRecipe = path.join(temporary,'terrain.json');
    fs.writeFileSync(terrainRecipe, run('terrain','template','meadow'));
    run('terrain','create',terrainRecipe,'--out',path.join(temporary,'app/meadow'));
    fs.cpSync(path.join(root,'examples/terrain-viewer'), path.join(temporary,'app/terrain-viewer'), {recursive:true});
    fs.cpSync(path.join(root,'examples/basecoat-catalog'), path.join(temporary,'app/examples/basecoat-catalog'), {recursive:true});
    fs.cpSync(path.join(root,'vendor/basecoat/dist'), path.join(temporary,'app/vendor/basecoat/dist'), {recursive:true});
    const code = 'import http.server, functools\ns=http.server.ThreadingHTTPServer(("127.0.0.1",0), functools.partial(http.server.SimpleHTTPRequestHandler,directory='+JSON.stringify(path.join(temporary,'app'))+'))\nprint(s.server_port,flush=True)\ns.serve_forever()';
    server = spawn(python, ['-u','-c',code], {stdio:['ignore','pipe','pipe']});
    let stderr = ''; server.stderr.on('data', d => stderr += d);
    const port = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error('Server start timeout: '+stderr)), 10000); // flaky-lint: allow a deadline for the server's port line, not a wait
      server.stdout.on('data', d => {text += d; if(text.includes('\n')){clearTimeout(timer); resolve(Number(text.trim()));}});
      server.on('error', reject);
      server.on('exit', c => {if(c) reject(new Error(stderr));});
    });
    browser = await chromium.launch({headless:true, args:CHROMIUM_ARGS, ...(process.env.CHROME?{executablePath:process.env.CHROME}:{})});
    const base = `http://127.0.0.1:${port}`;
    const only = process.env.SCENARIO;
    for(const {title, body} of tests){
      if(only && title !== only) continue;
      const started = Date.now();
      const context = await browser.newContext({viewport:{width:1280, height:900}});
      const externalRequests = [], errors = [];
      await context.route('**/*', route => {
        if(new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
        externalRequests.push(route.request().url()); return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      let error = null;
      try{
        await body({page, base});
        assert.deepEqual(externalRequests, [], 'Starters must not request CDNs, remote fonts or services');
        assert.deepEqual(errors, []);
      }catch(caught){error = caught;}
      await context.close();
      results.push({title, ms:Date.now()-started, error});
      console.log(`${error ? 'FAIL' : 'ok  '} ${title}${error ? '\n     '+error.message.split('\n').join('\n     ') : ''}`);
    }
  }finally{
    if(browser) await browser.close();
    if(server) server.kill();
    fs.rmSync(temporary, {recursive:true, force:true});
    fs.writeFileSync(path.join(root,'.test-output/browser-junit.xml'), junit(results));
  }
  const failed = results.filter(r => r.error).length;
  if(failed || !results.length){process.exitCode = 1; console.error(`${failed} of ${results.length} browser scenario(s) failed.`); return;}
  console.log(`${results.length} browser scenarios passed offline. Review screenshots separately for appearance.`);
}
main().catch(error => {console.error(error); process.exitCode = 1;});
