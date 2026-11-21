#!/usr/bin/env node
// Inkbot Design faceless reel renderer (text on screen + original background audio).
// Usage: node reel/render.mjs <reel-specs/slug.json> [outDir]
// Writes reels/<slug>/reel.mp4 (1080x1920, 30fps, H.264 + AAC) and reels/<slug>/cover.jpg.
// Needs Playwright (Chromium), the Inter font and ffmpeg. See README.md ("Reels").
//
// Rules the renderer enforces (from the Nov 2026 Instagram audit):
// - Beat 1 is the hook and is fully visible on the very first frame, so it reads as a still.
// - 4-8 beats, at most 12 words each, 12-35 seconds in total, then an end card.
// - All text stays inside the reel safe zone (clear of Instagram's top bar, caption and side buttons).
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audioExpr } from './audio.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)('playwright');
const specPath = process.argv[2];
if (!specPath) { console.error('usage: node reel/render.mjs reel-specs/<slug>.json [outDir]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const outDir = process.argv[3] || path.join(here, '..', 'reels', spec.slug);
fs.mkdirSync(outDir, { recursive: true });

const W = 1080, H = 1920, FPS = 30;
const fail = (m, code = 2) => { console.error(m); process.exit(code); };
const words = (s = '') => s.replace(/[\[\]*]/g, '').trim().split(/\s+/).filter(Boolean).length;

// ---- validate -------------------------------------------------------------
if (!spec.slug || !Array.isArray(spec.beats)) fail('spec needs "slug" and "beats"');
const theme = spec.theme ?? 'dark';
if (!['dark', 'blue'].includes(theme)) fail(`theme must be "dark" or "blue", not "${theme}"`);
if (spec.beats.length < 4 || spec.beats.length > 8) fail(`use 4-8 beats (got ${spec.beats.length})`);
spec.beats.forEach((b, i) => {
  if (!b.text) fail(`beat ${i + 1}: missing text`);
  if (words(b.text) > 12) fail(`beat ${i + 1}: ${words(b.text)} words, max 12`);
  if (b.kicker && words(b.kicker) > 5) fail(`beat ${i + 1}: kicker over 5 words`);
  if (/—/.test(b.text + (b.kicker || ''))) fail(`beat ${i + 1}: no em dashes`);
});
const end = spec.end || {};
if (!end.title) fail('spec needs "end": {"title": ..., "url": ...}');
if (words(end.title) > 9) fail('end title: max 9 words');

// ---- timing ---------------------------------------------------------------
// Default hold: enough to read at a glance, never a slow crawl.
const hold = (b, i) => b.hold ?? Math.min(3.4, Math.max(i === 0 ? 2.2 : 1.8, 0.6 + 0.27 * words(b.text)));
let t = 0;
const beats = spec.beats.map((b, i) => { const d = hold(b, i); const o = { ...b, start: t, dur: d }; t += d; return o; });
const endStart = t, endDur = end.hold ?? 3.2;
const total = +(endStart + endDur).toFixed(3);
if (total < 12 || total > 35) fail(`reel is ${total.toFixed(1)}s; keep it between 12 and 35s (adjust holds or beats)`);
const frames = Math.round(total * FPS);

// ---- page -----------------------------------------------------------------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const typo = (s) => s.replace(/(^|[\s(“])'/g, '$1‘').replace(/'/g, '’').replace(/(^|[\s(‘])"/g, '$1“').replace(/"/g, '”');
// Split into word spans for the staggered entrance; [words] become the accent colour.
function wordSpans(s) {
  const out = []; let acc = false;
  for (const tok of typo(esc(s)).split(/(\[|\])/)) {
    if (tok === '[') { acc = true; continue; }
    if (tok === ']') { acc = false; continue; }
    const glued = !/^\s/.test(tok); // text straight after "]" belongs to the previous word
    tok.split(/\s+/).filter(Boolean).forEach((w, j) => {
      if (j === 0 && glued && out.length && /^[.,!?;:’”)…]+/.test(w)) {
        const p = w.match(/^[.,!?;:’”)…]+/)[0];
        out[out.length - 1] = out[out.length - 1].replace(/<\/span>$/, `<span class="p">${p}</span></span>`);
        w = w.slice(p.length); if (!w) return;
      }
      out.push(`<span class="w${acc ? ' acc' : ''}">${w}</span>`);
    });
  }
  return out.join(' ');
}
const svg = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(here, '..', 'carousel', 'brand', n)).toString('base64');
const MARK = svg('id-mark-white-tight.svg');
const css = fs.readFileSync(path.join(here, 'style.css'), 'utf8');
const segs = beats.map((_, i) => `<div class="seg"><i id="p${i}"></i></div>`).join('');
const layers = beats.map((b, i) => `<div class="layer" id="b${i}">${b.kicker ? `<div class="kicker">${typo(esc(b.kicker))}</div>` : ''}<div class="txt${i === 0 ? ' hook' : ''}">${wordSpans(b.text)}</div></div>`).join('');
const endLayer = `<div class="layer end" id="end"><div class="txt">${wordSpans(end.title)}</div>${end.lede ? `<p class="lede">${typo(esc(end.lede))}</p>` : ''}<div class="url">${esc(end.url || 'inkbotdesign.com/links')}</div></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="frame ${theme}" id="f"><div class="grid"></div>
<div class="top"><div class="brand"><img src="${MARK}">Inkbot Design</div><div class="segs">${segs}</div></div>
<div class="stage">${layers}${endLayer}</div></div>
<script>
const B=${JSON.stringify(beats.map(b => ({ s: b.start, d: b.dur })))}, E={s:${endStart},d:${endDur}};
const ease=x=>1-Math.pow(1-Math.min(1,Math.max(0,x)),3);
function show(el,t0,dur,t,instant){
  const on=t>=t0&&t<t0+dur; el.style.display=on?'flex':'none'; if(!on)return;
  const lt=t-t0, out=ease((lt-(dur-0.16))/0.16);
  el.style.opacity=1-out; el.style.transform='translateY('+(-40*out)+'px)';
  el.querySelectorAll('.w,.kicker,.lede,.url').forEach((w,k)=>{
    const p=instant?1:ease((lt-0.05*k)/0.28);
    w.style.opacity=p; w.style.transform='translateY('+(36*(1-p))+'px)';
  });
  const tx=el.querySelector('.txt'); if(tx) tx.style.transform='scale('+(1+0.025*lt/dur)+')';
}
window.setT=t=>{
  B.forEach((b,i)=>{show(document.getElementById('b'+i),b.s,b.d,t,i===0);
    document.getElementById('p'+i).style.width=(100*Math.min(1,Math.max(0,(t-b.s)/b.d)))+'%';});
  show(document.getElementById('end'),E.s,E.d+1,t,false);
};
window.fits=()=>{ // every layer must sit inside the safe zone
  const z={t:300,b:1460,l:84,r:930}, bad=[];
  document.querySelectorAll('.layer').forEach(el=>{el.style.display='flex';el.style.opacity=1;el.style.transform='none';
    el.querySelectorAll('*').forEach(c=>{c.style.opacity=1;c.style.transform='none';const r=c.getBoundingClientRect();
      if(r.width&&(r.top<z.t||r.bottom>z.b||r.left<z.l||r.right>z.r))bad.push(el.id);});el.style.display='none';});
  return [...new Set(bad)];
};
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
if (!(await page.evaluate(() => document.fonts.check('800 40px Inter')))) fail('Inter is not installed (e.g. apt-get install fonts-inter).', 3);
let k = 1;
for (;;) {
  const bad = await page.evaluate((k) => { document.getElementById('f').style.setProperty('--k', k); return window.fits(); }, k);
  if (!bad.length) break;
  k = Math.round((k - 0.04) * 100) / 100;
  if (k < 0.76) fail(`${bad.join(', ')}: text does not fit the reel safe zone even at 76% type. Shorten it.`, 4);
}
if (k < 1) console.log(`type scaled to ${Math.round(k * 100)}% so every beat fits`);

// ---- audio (original, generated here, so no licensing issues) -------------
const wav = path.join(outDir, 'audio.wav');
const a = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc='${audioExpr()}':s=44100:d=${total}`,
  '-af', `lowpass=f=7000,afade=t=in:d=0.25,afade=t=out:st=${Math.max(0, total - 1.2)}:d=1.2,loudnorm=I=-16:TP=-1.5:LRA=7`, '-ar', '44100', wav], { stdio: 'inherit' });
if (a.status !== 0) fail('audio generation failed', 5);

// ---- video ----------------------------------------------------------------
const mp4 = path.join(outDir, 'reel.mp4');
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', wav,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.setT(t), f / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (f === 0) fs.writeFileSync(path.join(outDir, 'cover.jpg'), buf);
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await done;
await browser.close();
fs.rmSync(wav);
console.log(`wrote ${mp4} (${total.toFixed(1)}s, ${beats.length} beats + end card) and cover.jpg`);
