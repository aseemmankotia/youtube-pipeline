# YouTube Content Pipeline

A browser-based 4-step pipeline for end-to-end YouTube content creation:
**Trend discovery → Script → AI avatar video → Auto-upload.**

---

## Pipeline

```
Step 1: Trending Topics
   ↓  select a topic → auto-fills script input
Step 2: Script Generator
   ↓  "Send to Video Tab" → auto-starts HeyGen if credentials are saved
Step 3: Generate Video (HeyGen)
   ↓  polls every 10s → auto-switches to Upload tab when ready
       (auto-starts upload if YouTube credentials are saved)
Step 4: Upload to YouTube
   ↓  refreshes token → downloads video → resumable upload → "View on YouTube"
```

---

## Features

| Step | What it does |
|------|-------------|
| **1. Trending Topics** | Pick a niche → 5 trending topic ideas |
| **2. Script Generator** | Full YouTube script — Claude API or built-in template |
| **3. Generate Video** | HeyGen v2 — avatar + voice + script → MP4 |
| **4. Upload to YouTube** | Resumable chunked upload, auto-metadata, live YouTube link |
| **⚙ Settings** | All credentials in one place, auto-saved to localStorage, green ✓ per field, red dot if anything is missing |

---

## Quick Start

```bash
cd ~/youtube-pipeline
npx serve .
# open http://localhost:3000
```

> Requires HTTP — ES modules don't work from `file://`.

---

## Settings (⚙ tab)

All credentials live in the **⚙ Settings** tab. They're auto-saved to `localStorage` as you type — no save button needed. A green ✓ appears next to each filled field. A red dot on the Settings button means required credentials are missing.

| Credential | Required | Where to get it |
|------------|----------|-----------------|
| Anthropic API Key | Optional | console.anthropic.com — enables AI scripts (template fallback otherwise) |
| HeyGen API Key | Step 3 | app.heygen.com → Settings → API |
| HeyGen Avatar ID | Step 3 | app.heygen.com → Avatars → click avatar → copy ID |
| HeyGen Voice ID | Step 3 | `curl https://api.heygen.com/v2/voices -H "X-Api-Key: KEY"` |
| YouTube Client ID | Step 4 | Google Cloud Console → OAuth 2.0 Client |
| YouTube Client Secret | Step 4 | Same as above |
| YouTube Refresh Token | Step 4 | Run `node youtube-auth.js` once |

---

## YouTube OAuth Setup (one-time)

1. [console.cloud.google.com](https://console.cloud.google.com) → enable **YouTube Data API v3**
2. Create OAuth 2.0 Client ID (Web app), redirect URI: `http://localhost:8080`
3. Download JSON → save as `client_secrets.json` in project root
4. Run: `node youtube-auth.js`
5. Copy values from `client_secrets.json` and `youtube-token.json` into ⚙ Settings

---

## File Structure

```
youtube-pipeline/
├── index.html                  # 5-tab app shell (4 pipeline + settings)
├── styles.css                  # Dark theme + nav dot + checkmarks
├── app.js                      # Tab routing + settings dot + event chain
├── components/
│   ├── settings.js             # ⚙ All credentials, auto-save, getSettings()
│   ├── topics.js               # Step 1 — trending topics
│   ├── script.js               # Step 2 — script generator
│   ├── heygen.js               # Step 3 — HeyGen video
│   └── youtube.js              # Step 4 — YouTube upload
├── youtube-auth.js             # One-time OAuth setup (Node.js)
├── .gitignore
└── .github/workflows/
    └── deploy.yml              # Auto-deploys to GitHub Pages on push
```

---

## Live App

**https://aseemmankotia.github.io/youtube-pipeline/**
