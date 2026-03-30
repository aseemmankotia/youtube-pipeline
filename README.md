# YouTube Content Pipeline

A browser-based, fully automated 4-step pipeline for end-to-end YouTube content creation:
**Trend discovery → Script writing → Voice generation → AI avatar video.**

---

## Pipeline Overview

```
Step 1: Trending Topics
   ↓  (select topic → auto-fills script input)
Step 2: Script Generator
   ↓  ("Send to Voice" → auto-fills & switches tab)
Step 3: Voice — ElevenLabs TTS
   ↓  (audio complete → auto-switches tab, triggers HeyGen if credentials ready)
Step 4: Video — HeyGen Avatar
```

Each step auto-advances to the next when complete. If HeyGen credentials are
already entered, video generation starts automatically after audio finishes.

---

## Features

| Step | Tab | What it does |
|------|-----|-------------|
| 1 | **Trending Topics** | Pick a niche → fetch 5 trending topic ideas (live DuckDuckGo or curated fallback) |
| 2 | **Script Generator** | Generate a full structured YouTube script with tone / length / style controls. Uses Claude API when a key is provided, or a built-in template. |
| 3 | **Voice (ElevenLabs)** | Convert the script to audio via ElevenLabs TTS. Preset voices, stability/similarity controls, MP3 download. |
| 4 | **Video (HeyGen)** | Generate an AI avatar video via HeyGen v2 API. Polls every 10 s, animated progress bar, MP4 download + in-browser preview. |

---

## Quick Start

```bash
# Clone / enter the project
cd ~/youtube-pipeline

# Serve locally (ES modules require HTTP, not file://)
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:3000` (or `:8080`) in your browser.

---

## API Keys

| Service | Required | Where to get it | Where to paste it |
|---------|----------|-----------------|-------------------|
| **ElevenLabs** | For Step 3 | [elevenlabs.io](https://elevenlabs.io) → Profile → API Keys | Voice tab → ElevenLabs API Key |
| **HeyGen** | For Step 4 | [app.heygen.com](https://app.heygen.com) → Settings → API | Video tab → HeyGen API Key |
| **Claude** | Optional (Step 2) | [console.anthropic.com](https://console.anthropic.com) | Script tab → Claude API Key |

Keys are **never stored** — they live only in the input fields for the session.

---

## HeyGen Setup

1. Log in to [app.heygen.com](https://app.heygen.com)
2. Go to **Avatars** — copy an **Avatar ID** from any avatar you have access to
3. Go to **Settings → API** — copy your API key
4. Paste both into the Video tab
5. Enter a **HeyGen Voice ID** (find these in the HeyGen voice library) — this is used when no public audio URL is provided

### Using ElevenLabs audio with HeyGen

ElevenLabs produces a local browser blob URL which HeyGen's servers cannot access.
To use your ElevenLabs voiceover in the HeyGen video:

1. Download the MP3 from Step 3
2. Upload it to a public host (AWS S3, Cloudinary, Dropbox public link, etc.)
3. Paste the public URL into **"Public Audio URL"** in the Video tab

If no audio URL is provided, HeyGen uses its own TTS with the script text and
the Voice ID you enter.

---

## File Structure

```
youtube-pipeline/
├── index.html               # App shell & 4-tab nav
├── styles.css               # Dark theme + progress bar
├── app.js                   # Tab routing + auto-pipeline event chain
├── components/
│   ├── topics.js            # Step 1 — trending topic discovery
│   ├── script.js            # Step 2 — script generator (Claude / template)
│   ├── elevenlabs.js        # Step 3 — ElevenLabs TTS integration
│   └── heygen.js            # Step 4 — HeyGen video generation + polling
└── README.md
```

---

## Auto-Pipeline Events

The steps communicate via browser `CustomEvent`s:

| Event | Fired by | Handled by |
|-------|----------|------------|
| `send-to-voice` | Script Generator ("Send to Voice Tab" button) | app.js → switches to Voice tab, fills script |
| `audio-complete` | ElevenLabs (after successful generation) | app.js → switches to Video tab; heygen.js → auto-starts if credentials present |
| `video-complete` | HeyGen (when status = "completed") | Available for future extension |

---

## Extending

- **Live search:** Replace `liveSearch()` in `components/topics.js` with Brave Search / SerpAPI / your own backend proxy.
- **More voices:** Add entries to `PRESET_VOICES` in `components/elevenlabs.js`.
- **Different AI model:** In `components/script.js → generateWithClaude()`, swap the `model` field for any Claude model ID.
- **HeyGen backgrounds:** Edit the `background` field in `components/heygen.js → submitHeyGenJob()` to use images or videos instead of a solid colour.
