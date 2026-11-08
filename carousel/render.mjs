#!/usr/bin/env node
// Inkbot Design Instagram carousel renderer.
// Usage: node carousel/render.mjs <spec.json> [outDir]
// Renders 1080x1440 PNGs (slide-1.png ...) with all content kept inside the
// central 1080x1080 square (y 180-1260, x 84-996). Type shrinks automatically
// if a slide would overflow; the run fails if it still can't fit.
// Spec: { "slug": "...", "slides": [ {type, ...}, ... ] }  (see README.md)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)('playwright'); // pre-installed globally in the cloud environment
const specPath = process.argv[2];
if (!specPath) { console.error('usage: node render.mjs spec.json [outDir]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const outDir = process.argv[3] || path.join(here, '..', 'instagram', spec.slug);
fs.mkdirSync(outDir, { recursive: true });

const svg = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(here, 'brand', n)).toString('base64');
const MARK_W = svg('id-mark-white-tight.svg'), MARK_B = svg('id-mark-black-tight.svg');

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// [text] -> accent colour, **text** -> bold. Straight quotes become typographic.
const rich = (s = '') => esc(s)
  .replace(/(^|[\s(“])'/g, '$1‘').replace(/'/g, '’').replace(/(^|[\s(‘])"/g, '$1“').replace(/"/g, '”')
  .replace(/\[([^\]]+)\]/g, '<span class="acc">$1</span>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

const CSS = fs.readFileSync(path.join(here, 'style.css'), 'utf8');

function slideHTML(s, i, n) {
  const zone = s.type === 'cover' ? 'dark' : s.type === 'cta' ? 'blue' : '';
  const mid = zone ? '' : 'mid';
  const mark = zone ? MARK_W : MARK_B;
  const kicker = s.kicker ? `<div class="kicker">${rich(s.kicker)}</div>` : '';
  let body = '';
  switch (s.type) {
    case 'cover':
      body = `<div class="body"><h1>${rich(s.title)}</h1>${s.lede ? `<p class="lede">${rich(s.lede)}</p>` : ''}</div>`; break;
    case 'cta':
      body = `<div class="body"><h1>${rich(s.title)}</h1>${s.lede ? `<p class="lede">${rich(s.lede)}</p>` : ''}<div class="url">${esc(s.url || 'inkbotdesign.com/links')}</div></div>`; break;
    case 'point':
      body = `<h2>${rich(s.title)}</h2>${s.text ? `<p class="note">${rich(s.text)}</p>` : ''}`; break;
    case 'compare':
      body = `<h2>${rich(s.title)}</h2><div class="cmp">${s.cards.map((c, k) => `<div class="card${c.dark ?? k === s.cards.length - 1 ? ' on' : ''}"><div class="t">${rich(c.label)}</div><div class="v">${rich(c.text)}</div></div>`).join('')}</div>`; break;
    case 'chips':
      body = `<h2>${rich(s.title)}</h2><div class="chips${s.strong ? ' strong' : ''}">${s.chips.map(c => `<div class="chip">${rich(c)}</div>`).join('')}</div>${s.note ? `<p class="note">${rich(s.note)}</p>` : ''}`; break;
    case 'stat':
      body = `<h2>${rich(s.title)}</h2><div class="stat">${esc(s.stat)}</div><p class="statl">${rich(s.text)}</p>${s.source ? `<p class="src">${rich(s.source)}</p>` : ''}`; break;
    case 'list':
      body = `<h2>${rich(s.title)}</h2><ol>${s.items.map(it => `<li><div>${rich(it.title)}${it.text ? `<span>${rich(it.text)}</span>` : ''}</div></li>`).join('')}</ol>`; break;
    case 'quote':
      body = `<blockquote>${rich(s.quote)}</blockquote>${s.text ? `<p class="note">${rich(s.text)}</p>` : ''}`; break;
    default: throw new Error(`slide ${i + 1}: unknown type ${s.type}`);
  }
  return `<section class="s ${zone} ${mid}" id="s${i + 1}">${kicker}${body}
  <div class="foot"><div class="brand"><img src="${mark}">Inkbot Design</div><div>${spec.pagination === false ? '' : `${i + 1} / ${n}`}</div></div></section>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${spec.slides.map((s, i) => slideHTML(s, i, spec.slides.length)).join('\n')}</body></html>`;
fs.writeFileSync(path.join(outDir, 'slides.html'), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
if (!(await page.evaluate(() => document.fonts.check('800 40px Inter')))) {
  console.error('Inter is not installed: install the Inter font (e.g. fonts-inter) before rendering.'); process.exit(3);
}
const files = [];
for (let i = 1; i <= spec.slides.length; i++) {
  const sel = `#s${i}`;
  let k = 1, fit;
  for (;;) {
    fit = await page.evaluate(([sel, k]) => {
      const s = document.querySelector(sel); s.style.setProperty('--k', k);
      const o = s.getBoundingClientRect(); let t = 1e9, b = 0, l = 1e9, r = 0;
      s.querySelectorAll('*').forEach(e => { const c = e.getBoundingClientRect(); if (!c.width || !c.height) return;
        t = Math.min(t, c.top - o.top); b = Math.max(b, c.bottom - o.top); l = Math.min(l, c.left - o.left); r = Math.max(r, c.right - o.left); });
      const foot = s.querySelector('.foot').getBoundingClientRect();
      const content = [...s.children].filter(e => !e.classList.contains('foot')).map(e => e.getBoundingClientRect().bottom - o.top);
      return { t, b, l, r, contentBottom: Math.max(...content), footTop: foot.top - o.top, sh: s.scrollHeight };
    }, [sel, k]);
    const ok = fit.t >= 179 && fit.b <= 1261 && fit.l >= 83 && fit.r <= 997 && fit.sh <= 1440 && fit.contentBottom <= fit.footTop - 24;
    if (ok) break;
    k = Math.round((k - 0.04) * 100) / 100;
    if (k < 0.72) { console.error(`slide ${i}: content does not fit the safe square even at 72% type. Shorten it.`); process.exit(4); }
  }
  const f = path.join(outDir, `slide-${i}.png`);
  await page.locator(sel).screenshot({ path: f });
  files.push(f);
  console.log(`slide ${i}: ok${k < 1 ? ` (type scaled to ${Math.round(k * 100)}%)` : ''}`);
}
await browser.close();
fs.rmSync(path.join(outDir, 'slides.html'));
console.log(`wrote ${files.length} slides to ${outDir}`);
