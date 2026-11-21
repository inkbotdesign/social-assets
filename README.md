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
- Brand: Inter 800 headings with -0.04em tracking; blue #0042C7, ink #0A0A0A, slate #334155, paper #F8F9FA; blueprint grid; sentence-case labels; ID mark and "Inkbot Design" in the footer, plus "n / total" (the cover adds a small → swipe cue).
- Slide 1 is the cover: dark by default, or brand blue with `"cover": "blue"`. The last slide is the single blue band (call to action). The slides between are light.

## Spec

```json
{ "slug": "post-slug", "url": "https://inkbotdesign.com/post-slug/", "cover": "dark", "slides": [
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

`cover` sets slide 1's background: `"dark"` (default, black) or `"blue"` (brand blue, with highlighted words in pale blue). The autopilot alternates them by publish order so the profile grid and feed get some variation.

`[words]` in a title turns them blue; `**words**` in a note makes them bold. Straight quotes and apostrophes become typographic automatically.

Limits: kicker 5 words; cover title 9 words; titles 12 words; lede/note/text 35 words; chips 3-6 items of up to 4 words; list up to 6 items (title 7 words, text 9 words); card text 12 words. Seven slides: cover, five content slides using at least three different types, call to action. Facts from the article only.

## Reels (faceless: text on screen + background audio)

Added 21 Nov 2026 after the Instagram audit. Reels reach non-followers far better than carousels, so the autopilot now makes faceless reels as well as carousels.

```bash
# write reel-specs/<slug>.json, then push only the spec:
git add reel-specs && git commit -m "Reel: <slug>" && git push origin main
```

The **Render reels** Action (`.github/workflows/render-reels.yml`) renders `reels/<slug>/reel.mp4` (1080 x 1920, 30 fps, H.264 + AAC) and `reels/<slug>/cover.jpg`, checks them and commits them to `main`. Raw URL for Planable: `https://raw.githubusercontent.com/inkbotdesign/social-assets/main/reels/<slug>/reel.mp4`.

```json
{ "slug": "reel-slug", "theme": "dark", "beats": [
  {"text": "The hook: one specific claim, [accent words] in brackets"},
  {"kicker": "Optional label", "text": "One idea per beat"},
  {"text": "..."}
], "end": {"title": "Short closing line", "lede": "Optional one line", "url": "inkbotdesign.com/links"} }
```

- `theme`: `"dark"` or `"blue"` (alternate them like carousel covers).
- 4-8 beats, max 12 words each (kicker max 5), end title max 9 words. Total 12-35 seconds (holds are automatic: about 2-3s a beat, the end card 3.2s; set `"hold"` on a beat to override).
- Beat 1 is the hook and is fully on screen from the first frame, so it reads as a still in the feed and the grid. No greeting, no logo sting, no "In this video".
- Text stays inside the reel safe zone (y 300-1460, x 84-930), clear of Instagram's top bar, caption and side buttons; type shrinks to 76% if needed, otherwise the run fails with "text does not fit".
- The background track is original and synthesised during the render (`reel/audio.mjs`), so there is nothing to license. Trending Instagram audio can't be added through Planable; add it in the Instagram app if you want it.
- UK English, sentence case, no em dashes, facts from the post or the locked brand facts only.
