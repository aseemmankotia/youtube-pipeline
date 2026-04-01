#!/usr/bin/env node
/**
 * render.js — Local video rendering pipeline
 *
 * Usage:  npm run render
 *         (or: node render.js)
 *
 * Input:  render-input.json  (download from Tab 3 → Enhance with Slides)
 * Output: filename specified in render-input.json
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY in .env
 *   - ffmpeg + ffprobe installed (brew install ffmpeg)
 *   - npm install  (puppeteer, axios already in package.json)
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

const fs           = require('fs');
const path         = require('path');
const axios        = require('axios');
const puppeteer    = require('puppeteer');
const { execSync } = require('child_process');

const INPUT_FILE = path.join(__dirname, 'render-input.json');
const SLIDES_DIR = path.join(__dirname, 'slides');
const TEMP_DIR   = path.join(__dirname, 'temp');

// ── PIP configuration ──────────────────────────────────────────────────────────
// Avatar width in pixels (height auto-calculated to preserve aspect ratio).
const PIP_WIDTH    = 320;  // landscape avatar: scale to this width
const PIP_HEIGHT   = 360;  // portrait avatar: scale to this height (full body visible)

// Position of the avatar overlay. Options:
//   "bottom-right"  (default) — corner away from most slide content
//   "bottom-left"
//   "top-right"
const PIP_POSITION = 'bottom-right';

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  log('📖 Reading render-input.json…');
  if (!fs.existsSync(INPUT_FILE)) {
    die('render-input.json not found.\nGenerate it from the app: Tab 3 → Enhance with Slides → Download Render Files.');
  }

  const input = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const { topic, script, output_filename = 'final-video.mp4' } = input;

  if (!script) die('script is missing from render-input.json');
  if (!input.heygen_local_file && !input.heygen_video_url)
    die('render-input.json needs either heygen_local_file or heygen_video_url.');

  fs.mkdirSync(SLIDES_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR,   { recursive: true });

  const ffmpeg  = findBinary('ffmpeg');
  const ffprobe = findBinary('ffprobe');

  // ── Step 1: Split script into sections ──────────────────────────────────────
  log('\n🤖 Step 1 — Splitting script into sections via Anthropic API…');
  const sections = await splitScript(script, topic);
  log(`   ✓ ${sections.length} sections`);

  // ── Steps 2 & 3: Generate HTML slides + screenshot ──────────────────────────
  log('\n🎨 Steps 2-3 — Generating and screenshotting slides…');
  await generateSlides(sections);

  // ── Step 4: Get HeyGen video (local file or remote URL) ─────────────────────
  log('\n⬇  Step 4 — Locating HeyGen video…');
  const heygenPath = path.join(TEMP_DIR, 'heygen-raw.mp4');
  await resolveHeygenVideo(input, heygenPath);

  // ── Step 5: Get duration + distribute timings ────────────────────────────────
  log('\n⏱  Step 5 — Getting video duration and distributing slide timings…');
  const totalDuration = getVideoDuration(ffprobe, heygenPath);
  log(`   ✓ Total duration: ${totalDuration.toFixed(2)}s`);
  const timed = distributeDurations(sections, totalDuration);
  timed.forEach((s, i) => log(`   Slide ${i + 1}: ${s.duration.toFixed(1)}s — ${s.title}`));

  // ── Step 6: Composite ────────────────────────────────────────────────────────
  log('\n🎬 Step 6 — Compositing with FFmpeg…');
  const outPath = path.join(__dirname, output_filename);
  await composite(ffmpeg, ffprobe, timed, heygenPath, outPath);

  log(`\n✅ Render complete: ${output_filename}`);
}

// ── cleanScript (mirrors components/clean-script.js for Node.js) ──────────────

function cleanScript(raw) {
  if (!raw) return '';
  const lines = raw.split('\n').map(line => {
    let l = line.trim();
    if (/^#{1,6}(\s|$)/.test(l)) return '';
    if (/youtube\s+script/i.test(l)) return '';
    if (/^(entertainment|tutorial|how-to|opinion|commentary|news|explainer|storytime|narrative|tech|short|medium|long|minutes?)\s*$/i.test(l)) return '';
    if (/^[-=]{3,}$/.test(l)) return '';
    if (/^\[[\w\s/&:,.'"\d-]+\][:,]?\s*$/.test(l)) return '';
    l = l.replace(/\([^)]*\)/g, '');
    l = l.replace(/\*\*([^*\n]+)\*\*/g, '$1');
    l = l.replace(/\*[^*\n]+\*/g, '');
    l = l.replace(/__([^_\n]+)__/g, '$1');
    l = l.replace(/_([^_\n]+)_/g, '$1');
    l = l.replace(/```[\s\S]*?```/g, '');
    l = l.replace(/`[^`\n]*`/g, '');
    l = l.replace(/^>\s*/, '');
    l = l.replace(/^[-•]\s+/, '');
    return l.trim();
  });
  return lines.filter(l => l.length > 0).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Step 1: Split script via Anthropic API ─────────────────────────────────────

async function splitScript(script, topic) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) die('ANTHROPIC_API_KEY not set.\nAdd it to your .env file: ANTHROPIC_API_KEY=sk-ant-…');

  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are creating slide content for a YouTube video.

Topic: ${topic || 'YouTube Video'}

Script:
"""
${cleanScript(script)}
"""

Split this script into 5-8 sections for a slide presentation. Return ONLY valid JSON — no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "concise slide title (4-7 words)",
      "bullets": ["point 1", "point 2", "point 3"],
      "stat": "one compelling stat, quote, or number — or null",
      "script_excerpt": "the portion of the script this slide covers",
      "duration_seconds": 30
    }
  ]
}

Rules:
- 2-4 bullets per slide, each ≤ 12 words
- stat: striking number/fact/quote when it fits naturally, otherwise null
- duration_seconds proportional to script length (total ≈ script read at 130 wpm)`,
      }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  let text = res.data.content[0].text.trim();
  // Strip markdown fences if Claude wrapped it anyway
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  return JSON.parse(text).sections;
}

// ── Steps 2 & 3: HTML slides + Puppeteer screenshots ──────────────────────────

async function generateSlides(sections) {
  const total = sections.length;

  // Write HTML files
  for (let i = 0; i < total; i++) {
    const html = buildSlideHTML(sections[i], i, total);
    fs.writeFileSync(path.join(SLIDES_DIR, `slide-${i}.html`), html, 'utf8');
  }

  // Screenshot with Puppeteer
  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  for (let i = 0; i < total; i++) {
    const htmlPath = path.join(SLIDES_DIR, `slide-${i}.html`);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 20_000 });
    const pngPath = path.join(SLIDES_DIR, `slide-${i}.png`);
    await page.screenshot({ path: pngPath });
    log(`   ✓ slide-${i}.png`);
  }

  await browser.close();
}

function buildSlideHTML(section, index, total) {
  const bullets = (section.bullets || [])
    .map(b => `<li>${escHtml(b)}</li>`)
    .join('\n      ');

  const stat = section.stat
    ? `<div class="stat">${escHtml(section.stat)}</div>`
    : '';

  const dots = Array.from({ length: total }, (_, i) =>
    `<span class="dot${i === index ? ' active' : ''}"></span>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  width:1280px;height:720px;
  background:#0f0f0f;
  font-family:'Inter',system-ui,sans-serif;
  color:#fff;overflow:hidden;position:relative;
}
/* Subtle grid — full canvas */
body::before{
  content:'';position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:48px 48px;pointer-events:none;
}
/* Content area — full width, avatar overlays on top via FFmpeg */
.content{
  position:absolute;left:0;top:0;
  width:1280px;height:720px;
  padding:72px 80px;
  display:flex;flex-direction:column;justify-content:center;
  z-index:1;
}
.section-label{
  font-size:12px;font-weight:700;letter-spacing:5px;
  color:#ff4444;text-transform:uppercase;margin-bottom:22px;
}
.title{
  font-size:54px;font-weight:800;line-height:1.08;
  color:#fff;margin-bottom:32px;letter-spacing:-1px;
  max-width:900px;
}
ul.bullets{list-style:none;margin-bottom:28px;}
ul.bullets li{
  font-size:24px;color:#c0c0c0;line-height:1.5;
  margin-bottom:14px;padding-left:28px;position:relative;
}
ul.bullets li::before{
  content:'—';position:absolute;left:0;color:#ff4444;font-weight:700;
}
.stat{
  background:rgba(255,68,68,.09);
  border-left:3px solid #ff4444;
  padding:16px 22px;border-radius:0 6px 6px 0;
  font-size:21px;font-weight:600;color:#ff6b6b;
  font-style:italic;line-height:1.45;max-width:820px;
}
.progress{
  position:absolute;bottom:30px;left:80px;
  display:flex;align-items:center;gap:8px;z-index:2;
}
.dot{width:7px;height:7px;border-radius:50%;background:#2a2a2a;}
.dot.active{width:28px;border-radius:4px;background:#ff4444;}
</style>
</head>
<body>
<div class="content">
  <div class="section-label">Section ${index + 1} of ${total}</div>
  <h1 class="title">${escHtml(section.title)}</h1>
  <ul class="bullets">
    ${bullets}
  </ul>
  ${stat}
</div>
<div class="progress">${dots}</div>
</body>
</html>`;
}

/// ── Step 4: Resolve HeyGen video (local file or remote URL) ───────────────────

async function resolveHeygenVideo(input, dest) {
  // 1. Check for a local file named in render-input.json
  if (input.heygen_local_file) {
    const localPath = path.join(__dirname, input.heygen_local_file);
    if (fs.existsSync(localPath)) {
      log(`   ✓ Using local file: ${input.heygen_local_file}`);
      fs.copyFileSync(localPath, dest);
      return;
    }
    log(`   ⚠ Local file "${input.heygen_local_file}" not found — trying URL…`);
  }
  // 2. Fall back to downloading from URL
  if (input.heygen_video_url) {
    await downloadVideo(input.heygen_video_url, dest);
    return;
  }
  die(
    `No HeyGen video found.\n` +
    `Place your MP4 in ~/youtube-pipeline/ as "${input.heygen_local_file || 'heygen-input.mp4'}".\n` +
    `Or add a "heygen_video_url" field to render-input.json.`
  );
}

// ── Step 4b: Download from URL ─────────────────────────────────────────────────

async function downloadVideo(url, dest) {
  const res = await axios({ url, method: 'GET', responseType: 'stream' });
  const total = parseInt(res.headers['content-length'] || '0', 10);
  let downloaded = 0;

  const writer = fs.createWriteStream(dest);
  res.data.on('data', chunk => {
    downloaded += chunk.length;
    if (total) {
      const pct = ((downloaded / total) * 100).toFixed(1);
      process.stdout.write(`\r   ${pct}% (${mb(downloaded)} / ${mb(total)} MB)   `);
    }
  });
  res.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => { process.stdout.write('\n'); resolve(); });
    writer.on('error', reject);
  });
}

// ── Step 5: Duration helpers ───────────────────────────────────────────────────

function getVideoDuration(ffprobe, videoPath) {
  const out = execSync(
    `"${ffprobe}" -v error -show_entries format=duration ` +
    `-of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    { encoding: 'utf8' }
  ).trim();
  const dur = parseFloat(out);
  if (isNaN(dur) || dur <= 0) die(`Could not read duration from ${videoPath}`);
  return dur;
}

function hasAudioStream(ffprobe, videoPath) {
  try {
    const out = execSync(
      `"${ffprobe}" -v error -select_streams a:0 ` +
      `-show_entries stream=codec_type -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf8' }
    ).trim();
    return out.includes('audio');
  } catch {
    return false;
  }
}

function distributeDurations(sections, totalDuration) {
  const sum = sections.reduce((a, s) => a + (s.duration_seconds || 30), 0);
  return sections.map(s => ({
    ...s,
    duration: Math.max(((s.duration_seconds || 30) / sum) * totalDuration, 1.5),
  }));
}

// ── Step 6: Composite ──────────────────────────────────────────────────────────

async function composite(ffmpeg, ffprobe, sections, heygenPath, outPath) {
  const FPS  = 30;
  const FADE = 0.5;

  // 6a. Convert each slide PNG → short MP4 with fade-in/fade-out
  const segPaths = [];
  for (let i = 0; i < sections.length; i++) {
    const s            = sections[i];
    const dur          = s.duration;
    const fadeOutStart = (dur - FADE).toFixed(3);
    const png          = path.join(SLIDES_DIR, `slide-${i}.png`);
    const seg          = path.join(TEMP_DIR,   `seg-${i}.mp4`);

    execSync(
      `"${ffmpeg}" -y -loop 1 -framerate ${FPS} -i "${png}" ` +
      `-vf "scale=1280:720,` +
           `fade=t=in:st=0:d=${FADE},` +
           `fade=t=out:st=${fadeOutStart}:d=${FADE}" ` +
      `-t ${dur.toFixed(3)} -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "${seg}"`,
      { stdio: 'pipe' }
    );
    log(`   ✓ seg-${i}.mp4 (${dur.toFixed(1)}s)`);
    segPaths.push(seg);
  }

  // 6b. Write concat list
  const concatFile = path.join(TEMP_DIR, 'concat.txt');
  fs.writeFileSync(
    concatFile,
    segPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n'
  );

  // 6c. Concat slide segments → slideshow.mp4
  const slideshowPath = path.join(TEMP_DIR, 'slideshow.mp4');
  execSync(
    `"${ffmpeg}" -y -f concat -safe 0 -i "${concatFile}" -c copy "${slideshowPath}"`,
    { stdio: 'pipe' }
  );
  log('   ✓ slideshow.mp4 assembled');

  // 6d. Overlay avatar (PIP, bottom-right, white border)
  //     Avatar: 380×214 scaled, padded to 386×220 (3px white border each side)
  //     Position: x=884 (1280−386−10), y=490 (720−220−10)
  const hasAudio = hasAudioStream(ffprobe, heygenPath);
  // Use explicit -map "[outv]" (the labelled filter output) to avoid FFmpeg 8
  // auto-mapping input 0's raw video as a second stream alongside the overlay.
  const audioArgs = hasAudio
    ? `-map "[outv]" -map 1:a -c:a aac -b:a 192k`
    : `-map "[outv]" -an`;

  // Resolve overlay expression from PIP_POSITION
  const overlayExpr = {
    'bottom-right': 'W-w-20:H-h-20',
    'bottom-left':  '20:H-h-20',
    'top-right':    'W-w-20:20',
  }[PIP_POSITION] || 'W-w-20:H-h-20';

  // filter_complex:
  //   [0:v] scale slide to 1280×720                         → [bg]
  //   [1:v] scale avatar to PIP_WIDTH wide, auto height     → [av_scaled]
  //         pad with 3px white border on all sides          → [av_bordered]
  //   overlay [av_bordered] onto [bg] at chosen position    → output
  // Detect avatar aspect ratio to decide whether to crop before scaling.
  // Portrait videos (height > width, e.g. 1080×1920 from HeyGen) are cropped
  // to a 16:9 head-and-shoulders window from the top before PIP scaling.
  // Landscape videos are scaled directly.
  let probeOut;
  try {
    probeOut = execSync(
      `"${ffprobe}" -v error -select_streams v:0 ` +
      `-show_entries stream=width,height -of csv=p=0 "${heygenPath}"`,
      { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }
    ).trim();
  } catch { probeOut = ''; }
  const [avW, avH] = probeOut.split(',').map(Number);
  const isPortrait = avH > avW;

  // For portrait (e.g. 1080×1920 HeyGen): scale to PIP_HEIGHT tall, auto width.
  // No crop — keep the full body visible.
  // For landscape: scale to PIP_WIDTH wide, auto height.
  const pipScaleFilter = isPortrait
    ? `[1:v]scale=-2:${PIP_HEIGHT}[av_scaled]`
    : `[1:v]scale=${PIP_WIDTH}:-2[av_scaled]`;

  execSync(
    `"${ffmpeg}" -y ` +
    `-i "${slideshowPath}" ` +
    `-i "${heygenPath}" ` +
    `-filter_complex ` +
      `"[0:v]scale=1280:720[bg];` +
       `${pipScaleFilter};` +
       `[av_scaled]pad=iw+6:ih+6:3:3:color=white[av_bordered];` +
       `[bg][av_bordered]overlay=${overlayExpr}[outv]" ` +
    `-c:v libx264 -crf 22 -preset medium -pix_fmt yuv420p ` +
    `${audioArgs} ` +
    `"${outPath}"`,
    { stdio: 'pipe' }
  );
  log(`   ✓ ${path.basename(outPath)} written (PIP: ${PIP_POSITION}, ${PIP_WIDTH}px wide)`);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function findBinary(name) {
  const candidates = [
    `/opt/homebrew/bin/${name}`,  // Apple Silicon Mac
    `/usr/local/bin/${name}`,     // Intel Mac
    name,                          // PATH fallback
  ];
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" -version 2>&1`, { stdio: 'ignore' });
      return bin;
    } catch {}
  }
  throw new Error(`"${name}" not found. Install with: brew install ffmpeg`);
}

function mb(bytes) { return (bytes / 1_048_576).toFixed(1); }
function log(msg)  { console.log(msg); }
function die(msg)  { console.error(`\n❌ ${msg}\n`); process.exit(1); }

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Run ────────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('\n❌ Render failed:', err.message);
  process.exit(1);
});
