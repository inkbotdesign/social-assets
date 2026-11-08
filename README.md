# social-assets

This repo stores Inkbot Design's Instagram carousel images and the template that makes them. It holds no website code. Planable pulls the images from the public raw URLs:

`https://raw.githubusercontent.com/inkbotdesign/social-assets/main/instagram/<slug>/slide-<n>.png`

## Making a carousel

```bash
git clone --depth 1 https://github.com/inkbotdesign/social-assets
cd social-assets
# write specs/<slug>.json (see below), then push only the spec:
git add specs && git commit -m "Carousel: <slug>" && git push origin main
```

The **Render carousels** GitHub Action (`.github/workflows/render-carousels.yml`) runs on every push to `main` that adds or changes a spec. It renders `instagram/<slug>/slide-1.png ...`, checks each slide is 1080 x 1440, and commits the images back to `main` as `github-actions[bot]`. Wait for that run to finish green, and for the images to appear at the raw URLs, before using them in Planable. If a slide doesn't fit, the run fails with `slide N: content does not fit...`: shorten that slide's text and push the spec again.

To re-render by hand: Actions > Render carousels > Run workflow, with a slug or `all`. Changing the template (`carousel/`) does not re-render existing carousels automatically, so images already scheduled in Planable stay as they are.

Local rendering (`node carousel/render.mjs specs/<slug>.json`) still works if Playwright (Chromium) and the Inter font are installed, but scheduled Claude runs aren't allowed to execute repo code, so they push specs and let the Action render.

## Format

- 1080 x 1440 px (3:4). All content sits inside the central 1080 x 1080 square (180 px clear top and bottom, 84 px sides). The renderer measures every slide, shrinks the type down to 72% if needed, and fails if the content still doesn't fit.
- Brand: Inter 800 headings with -0.04em tracking; blue #0042C7, ink #0A0A0A, slate #334155, paper #F8F9FA; blueprint grid; sentence-case labels; ID mark and "Inkbot Design" in the footer, plus "n / total".
- Slide 1 is dark (cover). The last slide is the single blue band (call to action). The slides between are light.

## Spec

```json
{ "slug": "post-slug", "url": "https://inkbotdesign.com/post-slug/", "slides": [
  {"type": "cover",   "kicker": "...", "title": "...", "lede": "..."},
  {"type": "point",   "kicker": "...", "title": "...", "text": "..."},
  {"type": "compare", "kicker": "...", "title": "...", "cards": [{"label": "...", "text": "..."}, {"label": "...", "text": "..."}]},
  {"type": "chips",   "kicker": "...", "title": "...", "chips": ["...", "..."], "note": "...", "strong": true},
  {"type": "stat",    "kicker": "...", "title": "...", "stat": "824,000+", "text": "...", "source": "..."},
  {"type": "list",    "kicker": "...", "title": "...", "items": [{"title": "...", "text": "..."}]},
  {"type": "quote",   "kicker": "...", "quote": "...", "text": "..."},
  {"type": "cta",     "kicker": "The full guide", "title": "...", "lede": "... Read the full guide via the link in our bio.", "url": "inkbotdesign.com/links"}
]}
```

`[words]` in a title turns them blue; `**words**` in a note makes them bold. Straight quotes and apostrophes become typographic automatically.

Limits: kicker 5 words; cover title 9 words; titles 12 words; lede/note/text 35 words; chips 3-6 items of up to 4 words; list up to 6 items (title 7 words, text 9 words); card text 12 words. Seven slides: cover, five content slides using at least three different types, call to action. Facts from the article only.
