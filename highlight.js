#!/usr/bin/env node
/**
 * highlight.js — 60-second highlight clip generator
 *
 * Usage:  npm run highlight
 *         (or: node highlight.js)
 *
 * Input:  highlight-input.json  (download from Tab 5 → Distribute → Generate Highlight)
 * Output: highlight.mp4         (vertical 9:16, 1080×1920)
 *         highlight-output.json (caption data for social posts)
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY or GEMINI_API_KEY in .env
 *   - ffmpeg installed (brew install ffmpeg)
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

const fs               = require('fs');
const path             = require('path');
const puppeteer        = require('puppeteer');
const { execFileSync } = require('child_process');
const { callAI }       = require('./ai-client-node.js');

const INPUT_FILE  = path.join(__dirname, 'highlight-input.json');
const TEMP_DIR    = path.join(__dirname, 'temp');
const OUTPUT_FILE = path.join(__dirname, 'highlight.mp4');
const OUTPUT_JSON = path.join(__dirname, 'highlight-output.json');

// ── Utilities ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }

function die(msg) { console.error('\n❌ ' + msg); process.exit(1); }

function formatTime(s) {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function findBinary(name) {
  const candidates = [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    name,
  ];
  for (const bin of candidates) {
    try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); return bin; } catch {}
  }
  throw new Error(`"${name}" not found. Install with: brew install ffmpeg`);
}

function runFFmpeg(ffmpeg, args) {
  execFileSync(ffmpeg, args, { stdio: 'inherit' });
}

// ── Step 2 helper: find timestamp from word position ──────────────────────────

function findTimestamp(script, searchText, wordsPerMinute = 150) {
  // Clean script for word counting
  const cleanedScript = script
    .replace(/[#*\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Use first 6 words of the search phrase for robustness
  const scriptLower = cleanedScript.toLowerCase();
  const searchLower = searchText.toLowerCase()
    .split(' ').slice(0, 6).join(' ');

  const charPos = scriptLower.indexOf(searchLower);
  if (charPos === -1) {
    log(`   ⚠ start_text not found verbatim — defaulting to 0s`);
    return 0;
  }

  const wordsBefore = cleanedScript
    .substring(0, charPos)
    .split(/\s+/).length;

  const seconds = Math.round((wordsBefore / wordsPerMinute) * 60);
  return Math.max(0, seconds - 2); // 2-second buffer
}

// ── Step 3c helper: Puppeteer end card ────────────────────────────────────────

async function generateEndCard(browser, topic) {
  const safeTopicHtml = String(topic || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px;
    height: 1920px;
    background: linear-gradient(135deg, #0a0e1a 0%, #0d1b2e 50%, #0a0e1a 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: Arial, Helvetica, sans-serif;
  }
  .logo    { font-size: 42px; font-weight: 800; color: #00d4ff; margin-bottom: 20px; letter-spacing: -0.02em; }
  .channel { font-size: 32px; color: #ffffff; margin-bottom: 60px; }
  .topic   { font-size: 52px; font-weight: 700; color: #ffffff; text-align: center; padding: 0 60px; line-height: 1.2; margin-bottom: 40px; }
  .cta     { font-size: 44px; font-weight: 700; color: #f9a825; text-align: center; }
  .arrow   { font-size: 80px; color: #00d4ff; margin-top: 20px; }
  .watch   { font-size: 36px; color: #a8c8e8; margin-top: 20px; }
</style>
</head>
<body>
  <div class="logo">TechNuggets</div>
  <div class="channel">by Aseem</div>
  <div class="topic">${safeTopicHtml}</div>
  <div class="cta">Watch Full Video</div>
  <div class="arrow">&#8595;</div>
  <div class="watch">Link in Bio</div>
</body>
</html>`;

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({
    path: path.join(TEMP_DIR, 'end-card.png'),
    clip: { x: 0, y: 0, width: 1080, height: 1920 },
  });
  await page.close();
  log('   ✓ end-card.png generated');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  log('📖 Reading highlight-input.json…');

  if (!fs.existsSync(INPUT_FILE)) {
    die(
      'highlight-input.json not found.\n' +
      'Generate it from the app: Tab 5 → Distribute → ✂️ 60-Second Highlight → Generate Highlight.'
    );
  }

  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const {
    video_path,
    script,
    topic,
    tags        = [],
    youtube_url: youtubeUrl = '',
  } = input;

  if (!script)     die('script is missing from highlight-input.json');
  if (!video_path) die('video_path is missing from highlight-input.json');

  const videoPath = path.isAbsolute(video_path)
    ? video_path
    : path.join(__dirname, video_path);

  if (!fs.existsSync(videoPath)) {
    die(
      `Video file not found: ${videoPath}\n` +
      `Run "npm run render" first to generate the video, then re-download highlight-input.json.`
    );
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
    die('No AI key set.\nAdd to your .env file:\n  ANTHROPIC_API_KEY=sk-ant-…\n  GEMINI_API_KEY=AIza-…  (free at aistudio.google.com)');
  }

  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const ffmpeg = findBinary('ffmpeg');

  // ── Step 1: Find best 60-second segment via AI ────────────────────────────
  log('\n🤖 Step 1 — Analysing script for best 60-second segment…');

  const segmentText = await callAI({
    systemPrompt: `You analyze video scripts to find the most viral-worthy 60-second segment for TikTok/Reels.

Choose a segment that:
- Makes a strong standalone point
- Has a surprising stat, insight or revelation
- Starts with a hook that stops scrolling
- Works without needing context from the rest
- Has a natural start and end
- Would make someone want to watch the full video

Return ONLY JSON, no other text:
{
  "start_text": "first 8-10 words of the segment",
  "end_text": "last 8-10 words of the segment",
  "word_count": 150,
  "hook_type": "stat|question|revelation|story",
  "why_viral": "one sentence reason this works",
  "caption_line1": "first line of TikTok caption (max 8 words)",
  "caption_line2": "second line (max 8 words)",
  "caption_line3": "CTA line e.g. Full video in bio",
  "suggested_hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`,
    prompt:    `Find the best 60-second highlight segment from this script about: ${topic}\n\n${script}`,
    maxTokens: 500,
    action:    'highlight_selection',
  });

  let rawText = segmentText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const segment = JSON.parse(rawText);
  log(`   ✓ Segment found: "${segment.start_text}…"`);
  log(`   Hook type: ${segment.hook_type}`);
  log(`   Why viral: ${segment.why_viral}`);

  // ── Step 2: Calculate timestamp from word position ─────────────────────────
  log('\n⏱  Step 2 — Calculating timestamp…');

  const startSeconds = findTimestamp(script, segment.start_text);
  const endSeconds   = startSeconds + 62; // slightly over 60s

  log(`\n✂️  Cutting from ${formatTime(startSeconds)} to ${formatTime(endSeconds)}`);
  log(`   Why: ${segment.why_viral}`);

  // ── Step 3a: Cut raw segment ────────────────────────────────────────────────
  log('\n🎬 Step 3a — Cutting raw 62-second segment…');

  const rawClipPath = path.join(TEMP_DIR, 'highlight-raw.mp4');

  runFFmpeg(ffmpeg, [
    '-y',
    '-ss', String(startSeconds),
    '-i', videoPath,
    '-t', '62',
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '192k',
    rawClipPath,
  ]);
  log('   ✓ highlight-raw.mp4');

  // ── Step 3b: Convert to vertical 9:16 (1080×1920) ─────────────────────────
  log('\n📱 Step 3b — Converting to vertical 9:16 (1080×1920)…');
  log('   Strategy: blurred + scaled background, centred foreground');

  const verticalPath = path.join(TEMP_DIR, 'highlight-vertical.mp4');

  // Background: scale up and blur to fill vertical frame
  // Foreground: scale to fit width, centred over background
  const filterVertical = [
    '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,',
    'crop=1080:1920,',
    'gblur=sigma=20[bg];',
    '[0:v]scale=1080:-2[fg];',
    '[bg][fg]overlay=(W-w)/2:(H-h)/2[v]',
  ].join('');

  runFFmpeg(ffmpeg, [
    '-y',
    '-i', rawClipPath,
    '-filter_complex', filterVertical,
    '-map', '[v]',
    '-map', '0:a',
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '192k',
    verticalPath,
  ]);
  log('   ✓ highlight-vertical.mp4');

  // ── Step 3c: Generate end card via Puppeteer ────────────────────────────────
  log('\n🖼  Step 3c — Generating end card with Puppeteer…');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    await generateEndCard(browser, topic);
  } finally {
    await browser.close();
  }

  // ── Step 3d: Add caption overlay + end card ─────────────────────────────────
  log('\n✍️  Step 3d — Adding captions and end card overlay…');

  const caption1 = (segment.caption_line1 || '').toUpperCase();
  const caption2 = (segment.caption_line2 || '').toUpperCase();

  // Write captions to temp files — avoids FFmpeg filter text-escaping complexity
  const cap1File    = path.join(TEMP_DIR, 'caption1.txt');
  const cap2File    = path.join(TEMP_DIR, 'caption2.txt');
  const endCardFile = path.join(TEMP_DIR, 'end-card.png');
  fs.writeFileSync(cap1File, caption1, 'utf8');
  fs.writeFileSync(cap2File, caption2, 'utf8');

  // Build filter_complex as a single process argument (no shell quoting needed).
  // FFmpeg's own filter parser handles the single-quoted enable expressions.
  const filterCaption = [
    `[0:v]`,
    `drawtext=textfile='${cap1File}'`,
    `:fontsize=64:fontcolor=white`,
    `:x=(w-text_w)/2:y=h*0.75`,
    `:box=1:boxcolor=black@0.6:boxborderw=12`,
    `:enable='between(t,1,60)',`,
    `drawtext=textfile='${cap2File}'`,
    `:fontsize=52:fontcolor=white`,
    `:x=(w-text_w)/2:y=h*0.75+80`,
    `:box=1:boxcolor=black@0.6:boxborderw=10`,
    `:enable='between(t,1,60)'`,
    `[captioned];`,
    `[1:v]scale=1080:1920[endcard];`,
    `[captioned][endcard]overlay=0:0:enable='between(t,59,62)'[out]`,
  ].join('');

  runFFmpeg(ffmpeg, [
    '-y',
    '-i', verticalPath,
    '-i', endCardFile,
    '-filter_complex', filterCaption,
    '-map', '[out]',
    '-map', '0:a',
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'slow',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', '62',
    OUTPUT_FILE,
  ]);

  // ── Step 4: Summary + save caption data ────────────────────────────────────
  log('\n✅ Highlight clip ready: highlight.mp4');
  log(`   Duration: 62 seconds`);
  log(`   Format: 1080×1920 (vertical 9:16)`);
  log(`   Best moment: ${segment.why_viral}`);
  log('\n📱 Caption for TikTok/Instagram/Twitter:');
  log(`   ${segment.caption_line1}`);
  log(`   ${segment.caption_line2}`);
  log(`   ${segment.caption_line3}`);
  log('\n🏷️  Hashtags:');
  log(`   ${(segment.suggested_hashtags || []).join(' ')}`);
  log('\n📤 Upload to:');
  log('   TikTok:    https://www.tiktok.com/upload');
  log('   Instagram: https://www.instagram.com (Reels)');
  log('   Twitter/X: https://twitter.com (attach video)');

  const outputData = {
    video_path:    'highlight.mp4',
    caption_line1: segment.caption_line1,
    caption_line2: segment.caption_line2,
    caption_line3: segment.caption_line3,
    hashtags:      segment.suggested_hashtags || [],
    start_seconds: startSeconds,
    end_seconds:   endSeconds,
    why_viral:     segment.why_viral,
  };
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(outputData, null, 2), 'utf8');
  log('\n💾 Caption data saved to highlight-output.json');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
