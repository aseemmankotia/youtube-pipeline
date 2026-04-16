#!/usr/bin/env node
/**
 * thumbnail.js — YouTube thumbnail PNG generator
 *
 * Usage:  npm run thumbnail
 *         (or: node thumbnail.js)
 *
 * Input:  thumbnail-input.json  (download from Tab 6 → Marketing → Generate Thumbnails)
 * Output: thumbnails/thumbnail-1.png … thumbnail-5.png
 *         thumbnails/concepts.json
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY in .env
 *   - npm install  (puppeteer already in package.json)
 */

// ── Load .env without requiring dotenv package ─────────────────────────────────
;(function loadEnv() {
  try {
    require('fs').readFileSync('.env', 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^#=\s][^=]*)=(.*)/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  } catch {}
})();

const fs        = require('fs');
const path      = require('path');
const puppeteer = require('puppeteer');

const INPUT_FILE  = path.join(__dirname, 'thumbnail-input.json');
const OUT_DIR     = path.join(__dirname, 'thumbnails');
const CONCEPT_OUT = path.join(OUT_DIR, 'concepts.json');

// ── Utilities ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(msg); }
function die(msg)  { console.error('\n❌ ' + msg); process.exit(1); }
function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escH(s)   { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Background style map ───────────────────────────────────────────────────────

const BG_STYLES = {
  dark_gradient:  'linear-gradient(135deg,#0a0e1a 0%,#0d1b2e 40%,#0f2040 100%)',
  light_gradient: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)',
  solid_dark:     '#0a0e1a',
  solid_light:    '#1a237e',
};

// ── Build HTML for one thumbnail concept ──────────────────────────────────────

function buildThumbnailHTML(concept) {
  const bg        = BG_STYLES[concept.background_style] || BG_STYLES.dark_gradient;
  const accent    = concept.accent_color  || '#00d4ff';
  const primary   = concept.primary_color || '#6c5ce7';
  const titleText = concept.title_text    || '';
  const subText   = concept.subtitle_text || '';
  const emoji     = concept.icon_emoji    || '🎬';

  // Scale font size based on title length
  const titleLen = titleText.length;
  const titleFs  = titleLen > 25 ? 72 : titleLen > 18 ? 88 : titleLen > 12 ? 104 : 120;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px;
    height: 720px;
    background: ${bg};
    font-family: Arial, Helvetica, sans-serif;
    overflow: hidden;
    position: relative;
  }
  .bg-emoji {
    position: absolute;
    right: -20px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 320px;
    opacity: 0.08;
    line-height: 1;
    pointer-events: none;
    user-select: none;
  }
  .content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px 80px;
    max-width: 900px;
  }
  .channel {
    font-size: 26px;
    font-weight: 700;
    color: rgba(255,255,255,0.4);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 24px;
  }
  .title {
    font-size: ${titleFs}px;
    font-weight: 900;
    color: ${esc(accent)};
    text-transform: uppercase;
    line-height: 1.0;
    margin-bottom: 20px;
    text-shadow: 0 4px 24px rgba(0,0,0,0.6);
  }
  .subtitle {
    font-size: 36px;
    font-weight: 700;
    color: rgba(255,255,255,0.75);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: 1.3;
  }
  .year-badge {
    position: absolute;
    top: 36px;
    right: 40px;
    background: ${esc(accent)};
    color: #0a0e1a;
    font-size: 24px;
    font-weight: 900;
    padding: 8px 18px;
    border-radius: 4px;
    letter-spacing: 0.04em;
  }
  .bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 8px;
    background: linear-gradient(90deg, ${esc(accent)}, ${esc(primary)});
  }
</style>
</head>
<body>
  <div class="bg-emoji">${escH(emoji)}</div>
  <div class="content">
    <div class="channel">TechNuggets</div>
    <div class="title">${escH(titleText)}</div>
    ${subText ? `<div class="subtitle">${escH(subText)}</div>` : ''}
  </div>
  <div class="year-badge">2026</div>
  <div class="bottom-bar"></div>
</body>
</html>`;
}

// ── Step 1: Call Claude for thumbnail concepts ─────────────────────────────────

async function getThumbnailConcepts(input) {
  const { topic, script, tags = [] } = input;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 1500,
      system: `You are a YouTube thumbnail design expert. Create 5 distinct thumbnail concepts optimised for high CTR.

Each concept must differ in emotion, layout approach and visual strategy.
Return ONLY a JSON array of 5 objects with these exact fields:
[
  {
    "title_text":        "SHORT PUNCHY TITLE (max 4 words, ALL CAPS)",
    "subtitle_text":     "supporting detail or stat (optional, leave empty string if none)",
    "icon_emoji":        "single relevant emoji",
    "accent_color":      "#hex",
    "primary_color":     "#hex",
    "background_style":  "dark_gradient|light_gradient|solid_dark|solid_light",
    "emotion":           "curiosity|shock|fear|excitement|aspiration",
    "layout":            "bold-text|stat-focus|question|before-after|listicle",
    "hook_angle":        "one sentence why this thumbnail stops scrolling"
  }
]`,
      messages: [{
        role:    'user',
        content: `Create 5 YouTube thumbnail concepts for this video.\n\nTopic: ${topic}\nTags: ${tags.join(', ')}\n\nScript excerpt (first 500 chars):\n${(script || '').slice(0, 500)}`,
      }],
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    die(`Claude API error: ${e?.error?.message || res.statusText}`);
  }

  const data    = await res.json();
  let rawText   = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const m       = rawText.match(/```(?:json)?\s*([\s\S]+?)```/) || rawText.match(/(\[[\s\S]+\])/);
  if (!m) die('Could not parse Claude response as JSON array.');
  return JSON.parse(m[1]);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  log('📖 Reading thumbnail-input.json…');

  if (!fs.existsSync(INPUT_FILE)) {
    die(
      'thumbnail-input.json not found.\n' +
      'Generate it from the app: Tab 6 → Marketing → Thumbnail Generator → Download Input.'
    );
  }

  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

  if (!input.topic)  die('topic is missing from thumbnail-input.json');
  if (!input.script) die('script is missing from thumbnail-input.json');

  if (!process.env.ANTHROPIC_API_KEY) {
    die('ANTHROPIC_API_KEY not set.\nAdd it to your .env file: ANTHROPIC_API_KEY=sk-ant-…');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── Step 1: Get thumbnail concepts from Claude ─────────────────────────────
  log('\n🤖 Step 1 — Generating 5 thumbnail concepts with Claude…');
  const concepts = await getThumbnailConcepts(input);
  log(`   ✓ ${concepts.length} concepts received`);

  // ── Step 2: Render each concept to PNG via Puppeteer ──────────────────────
  log('\n🖼  Step 2 — Rendering thumbnails with Puppeteer…');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (let i = 0; i < concepts.length; i++) {
      const concept  = concepts[i];
      const outPath  = path.join(OUT_DIR, `thumbnail-${i + 1}.png`);
      const html     = buildThumbnailHTML(concept);

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 300));
      await page.screenshot({
        path: outPath,
        clip: { x: 0, y: 0, width: 1280, height: 720 },
      });
      await page.close();

      log(`   ✓ thumbnail-${i + 1}.png  [${concept.emotion} · ${concept.layout}]  "${concept.title_text}"`);
    }
  } finally {
    await browser.close();
  }

  // ── Step 3: Save concepts.json ─────────────────────────────────────────────
  fs.writeFileSync(CONCEPT_OUT, JSON.stringify(concepts, null, 2), 'utf8');
  log('\n💾 Concept data saved to thumbnails/concepts.json');

  log('\n✅ All thumbnails ready!');
  log('   Location: thumbnails/thumbnail-1.png … thumbnail-5.png');
  log('   Reload the Marketing tab in the app to see them as selectable options.');
  log('\n📤 Upload to YouTube: Settings → Marketing → Thumbnail Generator → Set as Thumbnail');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
