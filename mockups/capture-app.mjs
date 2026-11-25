// Captures the demo school's views for the product shots. One browser session opens /demo once (so only one
// demo school is seeded per device) and then moves around the app, saving each view into mockups/_shots/views.
// usage: node mockups/capture-app.mjs mockups/mockup.config.json [desktop|mobile]
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SKILL = 'C:/Users/Aizesogie Efe/.claude/skills/site-mockups/tools/common.mjs';
const { loadConfig, launch } = await import(pathToFileURL(SKILL).href);
const cfg = loadConfig(process.argv[2]);
const ONLY = process.argv[3];
const base = cfg.url.replace(/\/$/, '');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// The yellow demo banner and the scrollbar are left out of the stills.
const CSS = '.demo-banner{display:none!important} .device-wrap{display:none!important} html{scrollbar-width:none} ::-webkit-scrollbar{display:none}';

const browser = await launch();
const wait = (page, ms) => page.waitForTimeout(ms);
const shoot = async (page, name) => {
  await wait(page, 700);
  await page.screenshot({ path: path.join(cfg.viewsDir, `${name}.png`) });
  console.log('saved', name);
};
const openDemo = async (page) => {
  await page.goto(`${base}/demo`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForURL(/\/s\//, { timeout: 120000 });
  await page.waitForSelector('.stat-grid', { timeout: 60000 });
  await page.addStyleTag({ content: CSS });
  // let every chart's data arrive
  await page.waitForFunction(() => document.querySelectorAll('.bar-fill').length > 20, null, { timeout: 60000 });
  // last term's figures and this term's fees arrive a little later; wait for both
  await page.waitForFunction(() => /Fees collected\s*\d/.test(document.querySelector('.stat-grid')?.innerText || '') && document.querySelectorAll('.legend').length > 0, null, { timeout: 60000 }).catch(() => console.log('figures still loading'));
  await wait(page, 2500);
  return page.url().match(/\/s\/[^/?#]+/)[0];
};
const go = async (page, school, route) => {
  await page.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, school + route);
  await wait(page, 3500);
};
const scrollToSel = (page, sel, offset = 90) => page.evaluate(([s, o]) => { const el = document.querySelector(s); scrollTo(0, el ? el.getBoundingClientRect().top + scrollY - o : 0); }, [sel, offset]);

if (!ONLY || ONLY === 'desktop') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const school = await openDemo(page);

  // Overview: greeting, figures and the first charts
  await page.evaluate(() => scrollTo(0, 0));
  await shoot(page, 'desktop-dashboard');
  // The chart grid
  await scrollToSel(page, '.dash-grid > :nth-child(3)', 90);
  await shoot(page, 'desktop-charts');

  // A report card, opened from JSS 1A's report cards tab
  await go(page, school, '/classes');
  const href = await page.evaluate(() => [...document.querySelectorAll('main a')].find((a) => a.innerText.startsWith('JSS 1A'))?.getAttribute('href'));
  await page.evaluate((u) => { history.pushState({}, '', u + '?tab=reports'); dispatchEvent(new PopStateEvent('popstate')); }, href);
  await wait(page, 4000);
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'View card')?.click());
  await wait(page, 1200);
  await scrollToSel(page, '.report-card-sheet', 40);
  await shoot(page, 'desktop-reportcard');

  // The printed report cards, shown as they come out of the printer (print styles applied on screen, A4 on grey)
  await page.evaluate(() => { window.print = () => {}; [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Print all report cards')?.click(); });
  await wait(page, 600);
  await page.evaluate(() => {
    const css = [];
    for (const s of document.styleSheets) {
      try { for (const r of s.cssRules) if (r instanceof CSSMediaRule && /print/.test(r.conditionText)) css.push(r.cssText.replace(/^@media[^{]*\{/, '').replace(/\}\s*$/, '')); } catch {}
    }
    const st = document.createElement('style');
    st.textContent = css.join('\n').replace(/@page[^{]*\{[^{}]*(\{[^}]*\}[^{}]*)*\}/g, '') +
      ' body{background:#d8d4cb!important} #print-root{width:210mm;margin:40px auto;padding:16mm 14mm;box-sizing:border-box;background:#fff;box-shadow:0 30px 80px -30px rgba(0,0,0,.35)}';
    document.head.appendChild(st);
    scrollTo(0, 0);
  });
  await shoot(page, 'desktop-print');
  await page.evaluate(() => { document.getElementById('print-root')?.remove(); document.body.classList.remove('printing'); document.querySelectorAll('style').forEach((s) => s.textContent.includes('#print-root{width:210mm') && s.remove()); });

  // Bring in records: a spreadsheet, merged and matched, ready to check
  await go(page, school, '/import');
  const csv = 'S/N,Pupil Name,Adm No,Class,Sex,Parent,Phone,Outstanding\n1,Chiamaka Eze,GA/21/101,JSS 1B,F,Mrs Eze,08031234567,"12,500"\n2,Tobi Adewale,GA/21/102,JSS 1B,M,Mr Adewale,08039876543,0\n3,Halima Bello,GA/21/103,JSS 1B,F,Alhaji Bello,08051112222,25000\n4,Emeka Obi,GA/21/104,JSS 1B,M,Mrs Obi,08062223333,0\n5,Grace Okon,GA/20/060,JSS 1A,F,Mrs Okon,08073334444,0\n';
  await page.setInputFiles('.drop input', { name: 'old-register.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await wait(page, 3000);
  await scrollToSel(page, '.arm-plan', 140);
  await shoot(page, 'desktop-import');
  await ctx.close();
}

if (!ONLY || ONLY === 'mobile') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE });
  const page = await ctx.newPage();
  await openDemo(page);
  await page.evaluate(() => scrollTo(0, document.querySelector('.stat-grid').getBoundingClientRect().top + scrollY - 150));
  await shoot(page, 'mobile-dashboard');
  await ctx.close();
}
await browser.close();
