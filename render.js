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

Split this script into 5-8 sections for a slide presentation.
Choose the most visually impactful slide type for each section:
- "diagram"  — architecture, flows, step sequences, comparisons, processes
- "code"     — when the section covers code, commands, or technical implementation
- "stats"    — when a compelling number/percentage/statistic anchors the section
- "quote"    — expert opinions, key insights, memorable statements
- "bullets"  — default for general explanation sections

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "concise slide title (4-7 words)",
      "type": "bullets",
      "bullets": ["point 1 (≤12 words)", "point 2", "point 3"],
      "stat": "one striking number or null",
      "duration_seconds": 30
    },
    {
      "title": "How the Architecture Works",
      "type": "diagram",
      "mermaid_code": "graph LR\\n  A[User] --> B[API] --> C[Database]",
      "duration_seconds": 40
    },
    {
      "title": "Code in Action",
      "type": "code",
      "code_snippet": "const data = await fetch(url).then(r => r.json())",
      "code_language": "javascript",
      "duration_seconds": 35
    },
    {
      "title": "The Numbers",
      "type": "stats",
      "stat_number": "73%",
      "stat_label": "of developers now use AI tools daily",
      "stat_context": "Stack Overflow Developer Survey 2024",
      "duration_seconds": 30
    },
    {
      "title": "Key Insight",
      "type": "quote",
      "quote_text": "Any sufficiently advanced technology is indistinguishable from magic.",
      "quote_author": "Arthur C. Clarke",
      "duration_seconds": 25
    }
  ]
}

Rules:
- Omit fields that don't apply to the chosen type
- bullets: 2-4 points each ≤12 words; stat field optional (striking number/fact or null)
- diagram: valid Mermaid.js syntax only — no HTML, no markdown, escape backslashes as \\n
- code: syntactically correct snippet; code_language lowercase (javascript/python/bash/etc.)
- stats: stat_number includes unit/symbol (%, x, M, K); stat_context is one short attribution sentence
- quote: concise and impactful; real attribution in quote_author
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

  // Screenshot with Puppeteer — wait time varies by slide type
  const WAIT_MS = { bullets: 1500, diagram: 3000, code: 1500, stats: 2000, quote: 1000 };

  const browser = await puppeteer.launch({ headless: true });
  const page    = await browser.newPage();
  // deviceScaleFactor:2 = retina/2x resolution → sharper text after FFmpeg scaling
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

  for (let i = 0; i < total; i++) {
    const htmlPath = path.join(SLIDES_DIR, `slide-${i}.html`);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30_000 });

    // Wait for web fonts to finish loading before any animation wait
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 500)); // extra buffer after fonts

    // Additional wait for animations/Mermaid/count-up
    const waitMs = WAIT_MS[sections[i].type] || 1500;
    await new Promise(r => setTimeout(r, waitMs));

    // For diagram slides: log SVG dimensions to help debug sizing issues
    if (sections[i].type === 'diagram') {
      const svgDims = await page.evaluate(() => {
        const svg = document.querySelector('.mermaid svg');
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      if (svgDims) log(`     Mermaid SVG: ${svgDims.w}×${svgDims.h}px`);
      else          log('     ⚠ Mermaid SVG not found — diagram may not have rendered');
    }

    const pngPath = path.join(SLIDES_DIR, `slide-${i}.png`);
    await page.screenshot({
      path: pngPath,
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 720 },
    });
    log(`   ✓ slide-${i}.png (${sections[i].type || 'bullets'})`);
  }

  await browser.close();
}

// ── Shared slide helpers ───────────────────────────────────────────────────────

// CSS shared across all slide types
const SLIDE_BASE_CSS = `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  width:1280px;height:720px;
  background:#0f0f0f;
  font-family:'Inter',system-ui,sans-serif;
  color:#fff;overflow:hidden;position:relative;
}
body::before{
  content:'';position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);
  background-size:48px 48px;pointer-events:none;
}
.content{
  position:absolute;left:0;top:0;
  width:1280px;height:720px;
  /* padding-bottom:220px keeps content clear of the avatar PIP overlay */
  padding:56px 80px 220px;
  display:flex;flex-direction:column;
  z-index:1;
}
.section-label{
  font-size:11px;font-weight:700;letter-spacing:5px;
  color:#ff4444;text-transform:uppercase;margin-bottom:16px;opacity:.85;
}
.title{
  font-size:52px;font-weight:800;line-height:1.1;
  color:#fff;margin-bottom:24px;letter-spacing:-1px;
  max-width:900px;
}
.progress{
  position:absolute;bottom:28px;left:80px;
  display:flex;align-items:center;gap:8px;z-index:2;
}
.dot{width:7px;height:7px;border-radius:50%;background:#2a2a2a;}
.dot.active{width:28px;border-radius:4px;background:#ff4444;}
`;

function progressDots(index, total) {
  return Array.from({ length: total }, (_, i) =>
    `<span class="dot${i === index ? ' active' : ''}"></span>`
  ).join('');
}

function sectionLabel(index, total, type) {
  const labels = { bullets:'OVERVIEW', diagram:'DIAGRAM', code:'CODE', stats:'STATS', quote:'INSIGHT' };
  return `<div class="section-label">Section ${index + 1} of ${total} · ${labels[type] || type.toUpperCase()}</div>`;
}

// ── Slide type builders ────────────────────────────────────────────────────────

function buildSlideHTML(section, index, total) {
  switch (section.type) {
    case 'diagram': return buildDiagramSlide(section, index, total);
    case 'code':    return buildCodeSlide(section, index, total);
    case 'stats':   return buildStatsSlide(section, index, total);
    case 'quote':   return buildQuoteSlide(section, index, total);
    default:        return buildBulletsSlide(section, index, total);
  }
}

function buildBulletsSlide(section, index, total) {
  const bullets = (section.bullets || [])
    .map((b, i) => `<li style="animation-delay:${(i + 1) * 0.2}s">${escHtml(b)}</li>`)
    .join('\n    ');
  const stat = section.stat
    ? `<div class="stat-callout">${escHtml(section.stat)}</div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
@keyframes slideIn{from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:translateX(0)}}
ul.bullets{list-style:none;margin-bottom:20px;}
ul.bullets li{
  font-size:28px;color:#c0c0c0;line-height:1.5;
  margin-bottom:12px;padding-left:32px;position:relative;
  opacity:0;animation:slideIn 0.4s ease forwards;
}
ul.bullets li::before{content:'—';position:absolute;left:0;color:#ff4444;font-weight:700;}
.stat-callout{
  background:rgba(255,68,68,.09);border-left:3px solid #ff4444;
  padding:14px 20px;border-radius:0 6px 6px 0;
  font-size:19px;font-weight:600;color:#ff6b6b;font-style:italic;
  line-height:1.45;max-width:820px;
  opacity:0;animation:slideIn 0.4s ease 1s forwards;
}
</style></head><body>
<div class="content">
  ${sectionLabel(index, total, 'bullets')}
  <h1 class="title">${escHtml(section.title)}</h1>
  <ul class="bullets">${bullets}</ul>
  ${stat}
</div>
<div class="progress">${progressDots(index, total)}</div>
</body></html>`;
}

function buildDiagramSlide(section, index, total) {
  const mermaidCode = section.mermaid_code || 'graph LR\n  A[Start] --> B[End]';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
${SLIDE_BASE_CSS}
.diagram-wrap{
  flex:1;display:flex;align-items:center;justify-content:center;
  overflow:hidden;
}
.mermaid{
  width:100%;max-width:1100px;
  transform:scale(1.2);transform-origin:top center;
}
.mermaid svg{
  max-width:100%;height:auto;
  min-width:400px;
}
</style>
<script>
mermaid.initialize({
  theme: 'dark',
  startOnLoad: true,
  fontSize: 18,
  flowchart: { nodeSpacing: 50, rankSpacing: 60, padding: 20 },
  themeVariables: { fontSize: '18px', fontFamily: 'Inter, sans-serif' },
});
</script>
</head><body>
<div class="content">
  ${sectionLabel(index, total, 'diagram')}
  <h1 class="title">${escHtml(section.title)}</h1>
  <div class="diagram-wrap">
    <div class="mermaid">${mermaidCode}</div>
  </div>
</div>
<div class="progress">${progressDots(index, total)}</div>
</body></html>`;
}

// Simple inline keyword colorizer — no CDN dependency.
// Operates on already-HTML-escaped code.
function colorizeCode(escaped) {
  return escaped
    // Line comments — whole line green (do first to avoid re-coloring tokens inside)
    .replace(/(\/\/[^\n]*)/g,
      '<span style="color:#6a9955">$1</span>')
    // Single-quoted strings
    .replace(/('[^'\n\\]*(?:\\.[^'\n\\]*)*')/g,
      '<span style="color:#ce9178">$1</span>')
    // Double-quoted strings (HTML-escaped as &quot;...&quot;)
    .replace(/(&quot;[^<\n]*?&quot;)/g,
      '<span style="color:#ce9178">$1</span>')
    // Keywords
    .replace(/\b(const|let|var|function|return|if|else|import|export|class|async|await|for|while|do|switch|case|break|continue|new|delete|typeof|instanceof|true|false|null|undefined)\b/g,
      '<span style="color:#569cd6">$1</span>')
    // Numbers
    .replace(/\b(\d+\.?\d*)\b/g,
      '<span style="color:#b5cea8">$1</span>');
}

function buildCodeSlide(section, index, total) {
  const lang = (section.code_language || 'text').toLowerCase();

  // Truncate to first 20 lines
  const rawLines = (section.code_snippet || '// No code provided').split('\n');
  const truncated = rawLines.length > 20
    ? [...rawLines.slice(0, 20), '// ... (continued)']
    : rawLines;
  const escapedCode = colorizeCode(escHtml(truncated.join('\n')));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
.code-outer{position:relative;flex:1;max-width:1060px;}
.lang-badge{
  position:absolute;top:16px;right:16px;
  background:#569cd6;color:#fff;
  padding:4px 12px;border-radius:4px;
  font-size:14px;font-weight:700;letter-spacing:.5px;
  z-index:1;
}
pre{
  background:#1e1e1e;border-radius:8px;
  padding:30px;margin:0;overflow:auto;
  border:1px solid #333;
}
code{
  font-family:'Fira Code','Courier New',monospace;
  font-size:22px;line-height:1.6;
  color:#d4d4d4;white-space:pre;
  display:block;
}
</style></head><body>
<div class="content">
  ${sectionLabel(index, total, 'code')}
  <h1 class="title">${escHtml(section.title)}</h1>
  <div class="code-outer">
    <div class="lang-badge">${escHtml(lang.toUpperCase())}</div>
    <pre><code>${escapedCode}</code></pre>
  </div>
</div>
<div class="progress">${progressDots(index, total)}</div>
</body></html>`;
}

function buildStatsSlide(section, index, total) {
  const statNum  = String(section.stat_number || '?');
  const label    = section.stat_label   || '';
  const context  = section.stat_context || '';

  // Extract numeric part for count-up animation
  const match = statNum.match(/([\d,]+\.?\d*)/);
  const rawNum = match ? parseFloat(match[1].replace(/,/g, '')) : null;
  const prefix = match ? statNum.slice(0, match.index) : '';
  const suffix = match ? statNum.slice(match.index + match[1].length) : '';
  const isFloat = rawNum !== null && rawNum !== Math.floor(rawNum);

  const countUpScript = rawNum !== null ? `
<script>
(function(){
  const el=document.getElementById('stat-num');
  const target=${rawNum};const dur=1600;const start=performance.now();
  function tick(now){
    const t=Math.min((now-start)/dur,1);
    const ease=1-Math.pow(1-t,3);
    const v=target*ease;
    el.textContent='${prefix}'+(${isFloat}?v.toFixed(1):Math.round(v).toLocaleString())+'${suffix}';
    if(t<1)requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
</script>` : '';

  const startDisplay = rawNum !== null
    ? `${prefix}0${suffix}`
    : escHtml(statNum);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.stat-number{
  font-size:140px;font-weight:900;line-height:1;
  color:#ff4444;letter-spacing:-4px;margin-bottom:14px;
  font-variant-numeric:tabular-nums;
}
.stat-label{
  font-size:32px;font-weight:600;color:#e8e8e8;
  max-width:780px;line-height:1.3;margin-bottom:12px;
  animation:fadeUp 0.5s ease 0.6s both;
}
.stat-context{
  font-size:17px;color:#555;max-width:640px;line-height:1.5;
  animation:fadeUp 0.5s ease 1s both;
}
</style></head><body>
<div class="content">
  ${sectionLabel(index, total, 'stats')}
  <h1 class="title">${escHtml(section.title)}</h1>
  <div class="stat-number" id="stat-num">${startDisplay}</div>
  <div class="stat-label">${escHtml(label)}</div>
  ${context ? `<div class="stat-context">${escHtml(context)}</div>` : ''}
</div>
<div class="progress">${progressDots(index, total)}</div>
${countUpScript}
</body></html>`;
}

function buildQuoteSlide(section, index, total) {
  const text   = section.quote_text   || '';
  const author = section.quote_author || '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600&display=swap" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
body{background:linear-gradient(135deg,#0f0f0f 0%,#1a0808 100%);}
@keyframes fadeIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.quote-wrap{
  flex:1;display:flex;flex-direction:column;justify-content:center;
  max-width:900px;animation:fadeIn 0.7s ease forwards;
}
.quote-mark{
  font-size:110px;line-height:.65;font-family:Georgia,serif;
  color:#ff4444;opacity:.35;margin-bottom:6px;display:block;
}
.quote-text{
  font-size:40px;font-style:italic;font-weight:600;
  line-height:1.45;color:#e8e8e8;margin-bottom:28px;max-width:840px;
}
.quote-author{
  font-size:19px;font-weight:700;color:#ff4444;letter-spacing:.5px;
}
.quote-author::before{content:'— ';}
</style></head><body>
<div class="content">
  ${sectionLabel(index, total, 'quote')}
  <div class="quote-wrap">
    <span class="quote-mark">"</span>
    <p class="quote-text">${escHtml(text)}</p>
    <span class="quote-author">${escHtml(author)}</span>
  </div>
</div>
<div class="progress">${progressDots(index, total)}</div>
</body></html>`;
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
