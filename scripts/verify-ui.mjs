import { chromium } from 'playwright';
import binary from '@sparticuz/chromium';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || await binary.executablePath(),args:binary.args,headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 let file=u.pathname.startsWith('/_next/') ? path.join(process.cwd(),'.next',u.pathname.replace('/_next/','')) : u.pathname==='/preview' ? path.join(process.cwd(),'.next/server/app/preview.html') : path.join(process.cwd(),'public',u.pathname);
 try { const body=await readFile(file); const ext=path.extname(file); const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2','.png':'image/png'};await route.fulfill({body,contentType:types[ext]||'application/octet-stream'}); } catch {await route.abort();}
});
await page.goto('https://nozha.test/preview');
await page.evaluate(()=>document.fonts.ready);
assert.ok(await page.evaluate(()=>document.fonts.check('16px "Cairo Variable"','نظام إدارة الفروع')));
assert.match(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily),/Cairo Variable/);
await page.screenshot({path:'docs/screenshots/desktop.png',fullPage:true});
await page.screenshot({path:'docs/screenshots/overview.png',clip:{x:0,y:0,width:1440,height:1008}});
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'docs/screenshots/mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Page overflows mobile viewport');
console.log('PASS: actual built page, bundled Cairo font loaded, desktop + mobile layout');
await browser.close();
