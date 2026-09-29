/* Offline browser verification: real entry/scripts; no backend requests allowed. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const serveRoot = process.env.IDENTITY_BUILD ? path.join(root,'dist') : root;
const baseline = process.argv.includes('--baseline');
const out = path.join(root, 'output', 'identity-review');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const blocked = [], missing = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'pharmflow.test') { blocked.push(url.hostname); return route.abort(); }
    const file = path.resolve(serveRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(serveRoot + path.sep) || !fs.existsSync(file)) { missing.push(url.pathname); return route.fulfill({status:404, body:'Missing'}); }
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
    await route.fulfill({path:file, contentType:types[path.extname(file)] || 'application/octet-stream'});
  });
  await page.goto('http://pharmflow.test/');
  await page.waitForTimeout(1200);
  // Actual bootstrap applies branding. Offline/no-session auth settles on Sign In.
  await page.screenshot({path:path.join(out, baseline ? 'before-login.png':'login.png')});
  const brand = await page.locator('.authBrandName').evaluate(el => ({html:el.innerHTML, width:el.getBoundingClientRect().width}));
  if (!baseline) {
    const colors=await page.locator('.authBrandName').evaluate(el=>[...el.children].map(x=>getComputedStyle(x).color));
    assert.deepEqual(colors,['rgb(18, 52, 95)','rgb(8, 121, 232)']);
    assert.equal(await page.locator('.authBrandLogoCard img').evaluate(el=>getComputedStyle(el).filter),'none');
    await page.locator('#authPassword').fill('visual-test-only');
    await page.locator('#btnToggleAuthPassword').click();
    assert.equal(await page.locator('#authPassword').getAttribute('type'),'text');
    await page.locator('#btnToggleAuthPassword').click();
    assert.equal(await page.locator('#authPassword').getAttribute('type'),'password');
    await page.locator('#authPassword').fill('');
    await page.locator('#authRememberEmail').uncheck();
    assert.equal(await page.locator('#authRememberEmail').isChecked(),false);
    await page.locator('#authRememberEmail').check();
    await page.locator('#btnAuthShowPublicSignup').click();
    assert.equal(await page.locator('#authPublicSignupForm').isVisible(),true);
    await page.locator('#btnAuthShowLogin').click();
    await page.locator('#btnAuthShowInviteSignup').click();
    assert.equal(await page.locator('#authInviteSignupForm').isVisible(),true);
    await page.locator('#btnAuthShowLoginFromInvite').click();
  }
  const scan = await page.locator('.authBrandLogoCard').evaluate(el => {
    const animation = el.getAnimations({subtree:true}).find(a => a.animationName?.includes('Scan'));
    if (!animation) return null;
    animation.pause(); animation.currentTime=0;
    const before=getComputedStyle(el,'::after').left;
    animation.currentTime=3500;
    return {before,after:getComputedStyle(el,'::after').left};
  });
  await page.evaluate(() => window.PharmFlowIdleSleep.enter());
  const idle = await page.locator('.pf-idle-pill-main, .pf-idle-capsule').evaluate(el => {
    const a=el.getAnimations()[0];
    if (!a) return {animation:false};
    a.pause(); a.currentTime=0; const before=getComputedStyle(el).transform;
    a.currentTime=2600; return {before,after:getComputedStyle(el).transform};
  });
  await page.screenshot({path:path.join(out, baseline ? 'before-idle.png':'idle.png')});
  if (!baseline) {
    const titleSizes=await page.evaluate(()=>[getComputedStyle(document.querySelector('.pf-idle-brand')).fontSize,getComputedStyle(document.querySelector('#pf-idle-title')).fontSize]);
    assert.ok(parseFloat(titleSizes[0])>parseFloat(titleSizes[1]));
    for (const viewport of [{width:1366,height:768},{width:390,height:844},{width:360,height:640},{width:320,height:480}]) {
      await page.setViewportSize(viewport);
      assert.equal(await page.locator('.pf-idle-card').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
      assert.equal(await page.locator('#pf-idle-refresh').evaluate(el=>{const r=el.getBoundingClientRect();return r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}),true);
    }
    await page.setViewportSize({width:1440,height:900});
    await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('#pf-idle-refresh').click()]);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>window.PharmFlowIdleSleep.active),false);
    assert.equal(await page.locator('#authLoginForm').isVisible(),true);
    // Expose the real loading surface for phase inspection; no production state changes.
    await page.evaluate(()=>document.body.classList.add('authBooting'));
    async function phase(time) {
      return page.locator('.pfBootCapsule').evaluate((el,time)=>{
        for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=time;}
        return [...el.querySelectorAll('span')].map(x=>({transform:getComputedStyle(x).transform,opacity:getComputedStyle(x).opacity}));
      },time);
    }
    const closed=await phase(0);
    await page.screenshot({path:path.join(out,'loading-closed.png')});
    const opened=await phase(1900);
    await page.screenshot({path:path.join(out,'loading-open.png')});
    assert.notEqual(closed[0].transform,opened[0].transform);
    assert.ok(opened.slice(2).filter(x=>Number(x.opacity)>.5).length>=3);
    await phase(2500);
    await page.screenshot({path:path.join(out,'loading-falling.png')});
    const loop=await phase(4000);
    assert.equal(closed[0].transform,loop[0].transform);
    assert.equal(closed[1].transform,loop[1].transform);
    // Wall-clock proof, in addition to deterministic phase inspection.
    await page.locator('.pfBootCapsule').evaluate(el=>el.getAnimations({subtree:true}).forEach(a=>{a.currentTime=800;a.play()}));
    const movingA=await page.locator('.pfBootCapsuleLeft').evaluate(el=>getComputedStyle(el).transform);
    await page.waitForTimeout(700);
    const movingB=await page.locator('.pfBootCapsuleLeft').evaluate(el=>getComputedStyle(el).transform);
    assert.notEqual(movingA,movingB);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.pfBootCapsule').evaluate(el=>el.getAnimations({subtree:true}).length),0);
    assert.equal(await page.locator('.pfBootPellet').first().evaluate(el=>getComputedStyle(el).opacity),'0');
    await page.evaluate(()=>document.body.classList.remove('authBooting'));
    assert.equal(await page.locator('.authBrandLogoCard').evaluate(el=>el.getAnimations({subtree:true}).length),0);
    await page.evaluate(()=>window.PharmFlowIdleSleep.enter());
    assert.equal(await page.locator('.pf-idle-capsule').evaluate(el=>el.getAnimations().length),0);
    await page.emulateMedia({reducedMotion:'no-preference'});
    const idleA=await page.locator('.pf-idle-capsule').evaluate(el=>getComputedStyle(el).transform);
    await page.waitForTimeout(800);
    const idleB=await page.locator('.pf-idle-capsule').evaluate(el=>getComputedStyle(el).transform);
    assert.notEqual(idleA,idleB);
    await Promise.all([page.waitForEvent('domcontentloaded'),page.keyboard.press('Enter')]);
    assert.equal(await page.evaluate(()=>window.PharmFlowIdleSleep.active),false);
    for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:360,height:640}]){
      await page.setViewportSize(viewport);
      await page.screenshot({path:path.join(out,`login-${viewport.width}.png`)});
      assert.equal(await page.locator('#btnAuthShowInviteSignup').evaluate(el=>{const r=el.getBoundingClientRect();return r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}),true);
    }
    // Check the actual idle controller's boundary with a virtual clock, without
    // running cloud workspace timers or contacting an account.
    const timerPage=await browser.newPage();
    await timerPage.clock.install({time:new Date('2026-09-29T00:00:00Z')});
    await timerPage.clock.pauseAt(new Date('2026-09-29T00:00:01Z'));
    await timerPage.setContent('<html><body></body></html>');
    const cloud=fs.readFileSync(path.join(root,'cloud-workspace.js'),'utf8');
    await timerPage.addScriptTag({content:cloud.slice(0,cloud.indexOf('})();')+5)});
    await timerPage.clock.fastForward(599999);
    assert.equal(await timerPage.evaluate(()=>PharmFlowIdleSleep.active),false);
    await timerPage.clock.fastForward(1);
    assert.equal(await timerPage.evaluate(()=>PharmFlowIdleSleep.active),true);
    await timerPage.close();
  }
  console.log(JSON.stringify({brand,scan,idle,missing,errors,blocked:[...new Set(blocked)]},null,2));
  if (!baseline) {
    assert.match(brand.html, /<span>Pharm<\/span><strong>Flow<\/strong>/);
    assert.notEqual(scan.before,scan.after);
    assert.notEqual(idle.before,idle.after);
    assert.deepEqual(missing,[]);
    assert.deepEqual(errors,[]);
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
