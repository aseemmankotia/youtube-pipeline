# YouTube Content Pipeline

A browser-based tool for end-to-end YouTube content creation: trend discovery → script writing → voice generation.

## Features

| Tab | What it does |
|-----|-------------|
| **Trending Topics** | Pick a niche, fetch 5 trending topic ideas (live via DuckDuckGo or curated seed data) |
| **Script Generator** | Generate a full, structured YouTube script with tone/length/style controls. Uses Claude API when a key is provided, or a built-in template. |
| **Voice (ElevenLabs)** | Send the script to ElevenLabs TTS API — pick a preset voice or enter a custom Voice ID, then download the MP3. |

## Quick Start

```bash
# Serve locally (any static file server works)
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

> **Important:** The app uses ES modules (`type="module"`), so it must be served over HTTP — opening `index.html` directly as a `file://` URL will not work.

## API Keys

| Service | Where to get it | Where to paste it |
|---------|-----------------|-------------------|
| Claude (optional) | [console.anthropic.com](https://console.anthropic.com) | Script Generator → Claude API Key field |
| ElevenLabs (required for voice) | [elevenlabs.io](https://elevenlabs.io) | Voice tab → ElevenLabs API Key field |

Keys are never stored — they live only in the input fields for the duration of your session.

## File Structure

```
youtube-pipeline/
├── index.html               # App shell & tab navigation
├── styles.css               # All styles (dark theme)
├── app.js                   # Tab routing + component wiring
├── components/
│   ├── topics.js            # Trending topic discovery
│   ├── script.js            # Script generator (Claude / template)
│   └── elevenlabs.js        # ElevenLabs TTS integration
└── README.md
```

## Extending

- **Live search:** In `components/topics.js`, replace `liveSearch()` with a call to Brave Search API, SerpAPI, or your own backend proxy.
- **More voices:** Add entries to `PRESET_VOICES` in `components/elevenlabs.js`.
- **Different AI model:** In `components/script.js → generateWithClaude()`, swap the `model` field for any Claude model ID.
