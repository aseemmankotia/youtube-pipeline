# YouTube Content Pipeline

A browser-based 3-step pipeline for end-to-end YouTube content creation:
**Trend discovery → Script writing → AI avatar video.**

---

## Pipeline

```
Step 1: Trending Topics
   ↓  select a topic → auto-fills script input
Step 2: Script Generator
   ↓  "Send to Video Tab" → auto-fills & switches tab
       (auto-starts video generation if HeyGen credentials are already entered)
Step 3: Generate Video (HeyGen)
   ↓  polls every 10s → preview + MP4 download when ready
```

---

## Features

| Step | What it does |
|------|-------------|
| **1. Trending Topics** | Pick a niche → fetch 5 trending topic ideas (live DuckDuckGo or curated fallback) |
| **2. Script Generator** | Full YouTube script with tone / length / style controls. Uses Claude API when a key is provided, or a built-in template. |
| **3. Generate Video** | HeyGen v2 API — avatar + voice ID + script → renders MP4. Progress bar, 20 min timeout, retry on failure. |

---

## Quick Start

```bash
cd ~/youtube-pipeline
npx serve .
# open http://localhost:3000
```

> Must be served over HTTP — ES modules don't work from `file://`.

---

## API Keys

| Service | Required | Where to get it | Where to paste it |
|---------|----------|-----------------|-------------------|
| **HeyGen** | Yes (Step 3) | app.heygen.com → Settings → API | Video tab → HeyGen API Key |
| **Claude** | Optional (Step 2) | console.anthropic.com | Script tab → Claude API Key |

Keys are never stored — session only.

---

## HeyGen Setup

1. **API Key** — app.heygen.com → Settings → API
2. **Avatar ID** — app.heygen.com → Avatars → click any avatar → copy its ID
3. **Voice ID** — run this to list your voices:
   ```bash
   curl -s "https://api.heygen.com/v2/voices" \
     -H "X-Api-Key: YOUR_KEY" | python3 -m json.tool | grep -A1 '"name"'
   ```

---

## File Structure

```
youtube-pipeline/
├── index.html                  # App shell — 3-tab nav
├── styles.css                  # Dark theme
├── app.js                      # Tab routing + auto-pipeline events
├── components/
│   ├── topics.js               # Step 1 — trending topic discovery
│   ├── script.js               # Step 2 — script generator
│   └── heygen.js               # Step 3 — HeyGen video generation
└── .github/workflows/
    └── deploy.yml              # Auto-deploys to GitHub Pages on push
```

---

## Live App

**https://aseemmankotia.github.io/youtube-pipeline/**
