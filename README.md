# YouTube Content Pipeline

A browser-based 4-step pipeline for end-to-end YouTube content creation:
**Trend discovery → Script → AI avatar video → Auto-upload.**

---

## Pipeline

```
Step 1: Trending Topics
   ↓  select a topic → auto-fills script input
Step 2: Script Generator
   ↓  "Send to Video Tab" → auto-fills & switches tab
       (auto-starts HeyGen if credentials are already entered)
Step 3: Generate Video (HeyGen)
   ↓  polls every 10s → when ready, auto-switches to Upload tab
       (auto-starts upload if YouTube credentials are saved)
Step 4: Upload to YouTube
   ↓  refreshes token → downloads video → resumable upload → "View on YouTube"
```

---

## Features

| Step | What it does |
|------|-------------|
| **1. Trending Topics** | Pick a niche → 5 trending topic ideas (live or curated) |
| **2. Script Generator** | Full YouTube script with tone/length/style. Uses Claude API or built-in template. |
| **3. Generate Video** | HeyGen v2 — avatar + voice + script → MP4. Progress bar, polling, retry. |
| **4. Upload to YouTube** | Refreshes OAuth token → resumable chunked upload → live YouTube link. Title, description, and tags auto-generated from the script. |

---

## Quick Start

```bash
cd ~/youtube-pipeline
npx serve .
# open http://localhost:3000
```

> Requires HTTP — ES modules don't work from `file://`.

---

## API Keys & Credentials

| Service | Required | Where to get it |
|---------|----------|-----------------|
| **HeyGen** | Step 3 | app.heygen.com → Settings → API |
| **YouTube OAuth** | Step 4 | See setup below |
| **Claude** | Optional (Step 2) | console.anthropic.com |

---

## YouTube OAuth Setup (one-time)

### 1. Create OAuth credentials in Google Cloud Console
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. Enable **YouTube Data API v3** (APIs & Services → Library)
4. Create an OAuth 2.0 Client ID (APIs & Services → Credentials):
   - Type: **Web application**
   - Authorised redirect URI: `http://localhost:8080`
5. Download the JSON → save as `client_secrets.json` in the project root

### 2. Run the auth script (one-time)
```bash
node youtube-auth.js
```
Your browser opens, you approve, and `youtube-token.json` is saved.

### 3. Paste credentials into the app
In the **Upload to YouTube** tab:
- **Client ID** and **Client Secret** — from `client_secrets.json`
- **Refresh Token** — from `youtube-token.json`
- Click **Save Credentials** — stored in `localStorage`, pre-filled on future visits

---

## File Structure

```
youtube-pipeline/
├── index.html                  # 4-tab app shell
├── styles.css                  # Dark theme
├── app.js                      # Tab routing + 4-step event chain
├── components/
│   ├── topics.js               # Step 1 — trending topics
│   ├── script.js               # Step 2 — script generator
│   ├── heygen.js               # Step 3 — HeyGen video
│   └── youtube.js              # Step 4 — YouTube upload
├── youtube-auth.js             # One-time OAuth setup (Node.js)
├── .gitignore                  # Excludes client_secrets.json, youtube-token.json
└── .github/workflows/
    └── deploy.yml              # Auto-deploys to GitHub Pages on push
```

---

## Live App

**https://aseemmankotia.github.io/youtube-pipeline/**
