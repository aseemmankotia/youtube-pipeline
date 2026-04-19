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
 *   - ANTHROPIC_API_KEY or GEMINI_API_KEY in .env
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
const { execSync, spawn } = require('child_process');
const { callAI }   = require('./ai-client-node.js');

const INPUT_FILE  = path.join(__dirname, 'render-input.json');
const SLIDES_DIR  = path.join(__dirname, 'slides');
const TEMP_DIR    = path.join(__dirname, 'temp');
const CACHE_FILE  = path.join(__dirname, 'slides', 'section-cache.json');
const CACHE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 days
const FORCE_REFRESH = process.argv.includes('--force-refresh');

// ── PIP configuration ──────────────────────────────────────────────────────────
// Avatar width in pixels (height auto-calculated to preserve aspect ratio).
const PIP_WIDTH    = 160;  // landscape avatar: scale to this width
const PIP_HEIGHT   = 180;  // portrait avatar: scale to this height (full body visible)

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
  const { topic, script, hook = '', niche = '', output_filename = 'final-video.mp4' } = input;

  if (!script) die('script is missing from render-input.json');
  if (!input.heygen_local_file && !input.heygen_video_url)
    die('render-input.json needs either heygen_local_file or heygen_video_url.');

  fs.mkdirSync(SLIDES_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR,   { recursive: true });

  const ffmpeg  = findBinary('ffmpeg');
  const ffprobe = findBinary('ffprobe');

  // ── Step 1: Split script into sections (cache-aware) ────────────────────────
  log('\n🤖 Step 1 — Splitting script into sections…');
  cleanSectionCache();  // purge entries older than 7 days
  const hash = scriptHash(script);
  let contentSections;

  if (!FORCE_REFRESH) {
    const hit = readSectionCache(hash);
    if (hit) {
      log(`   ⚡ Using cached section analysis (saved ~$0.08) · cached at ${hit.cached_at}`);
      contentSections = hit.sections;
    }
  }

  if (!contentSections) {
    if (FORCE_REFRESH) log('   --force-refresh: skipping cache');
    contentSections = await splitScript(script, topic);
    writeSectionCache(hash, contentSections, topic);
    log(`   ✓ ${contentSections.length} sections · saved to cache`);
  } else {
    log(`   ✓ ${contentSections.length} sections`);
  }

  // Fix 1-5: clean placeholder text, validate diagrams, skip empty slides
  const beforeCount = contentSections.length;
  contentSections = preprocessSections(contentSections);
  if (contentSections.length < beforeCount) {
    log(`   ⏭ ${beforeCount - contentSections.length} slide(s) skipped after cleanup`);
  }

  // Prepend title slide (30 s) + append Thank You slide (8 s)
  const titleSection   = { type: 'title',    title: topic, hook, niche, duration_seconds: 30 };
  const thankYouSection = { type: 'thankyou', title: 'Thank You',       duration_seconds: 8  };
  const sections = [titleSection, ...contentSections, thankYouSection];

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

// ── Section analysis cache ─────────────────────────────────────────────────────

function scriptHash(script) {
  const str = script.slice(0, 500) + script.slice(-500);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function loadCacheFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveCacheFile(data) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

function readSectionCache(hash) {
  const cache = loadCacheFile();
  const entry = cache[hash];
  if (!entry) return null;
  if ((Date.now() - new Date(entry.cached_at).getTime()) > CACHE_TTL) return null;
  return entry;
}

function writeSectionCache(hash, sections, topic) {
  const cache = loadCacheFile();
  cache[hash] = { sections, topic, cached_at: new Date().toISOString() };
  saveCacheFile(cache);
}

function cleanSectionCache() {
  try {
    const cache = loadCacheFile();
    let removed = 0;
    for (const hash of Object.keys(cache)) {
      if ((Date.now() - new Date(cache[hash].cached_at).getTime()) > CACHE_TTL) {
        delete cache[hash];
        removed++;
      }
    }
    if (removed > 0) { saveCacheFile(cache); log(`   🗑 Purged ${removed} expired cache entries`); }
  } catch {}
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

// ── Fix 1 & 4: Placeholder detection + global slide text cleaner ───────────────

const PLACEHOLDER_PATTERNS = [
  /see (the )?diagram.*/gi,
  /see (accompanying|related|attached).*/gi,
  /refer to (the )?(diagram|figure|illustration).*/gi,
  /\[diagram[^\]]*\]/gi,
  /\[figure[^\]]*\]/gi,
  /\[insert[^\]]*\]/gi,
  /\[illustration[^\]]*\]/gi,
  /diagram not available.*/gi,
  /see figure \d+.*/gi,
  /as shown in the (diagram|figure).*/gi,
  /illustrated (below|above|in).*/gi,
];

function removePlaceholders(text) {
  if (!text) return '';
  let out = text;
  for (const pat of PLACEHOLDER_PATTERNS) out = out.replace(pat, '');
  return out.trim();
}

function cleanSlideText(text) {
  if (!text) return '';
  let t = removePlaceholders(text);
  // Strip residual markdown
  t = t.replace(/\*\*/g, '').replace(/\*/g, '');
  t = t.replace(/#{1,6}\s*/g, '');
  t = t.replace(/`/g, '');
  // Remove bracketed content and "see …" parentheticals
  t = t.replace(/\[[^\]]*\]/g, '');
  t = t.replace(/\([^)]*see[^)]*\)/gi, '');
  // Collapse whitespace
  return t.replace(/\s+/g, ' ').trim();
}

// ── Fix 3: Mermaid code validator ─────────────────────────────────────────────

const VALID_MERMAID_STARTS = [
  'flowchart', 'graph', 'sequencediagram',
  'classdiagram', 'statediagram', 'erdiagram',
  'gantt', 'pie', 'gitgraph', 'mindmap',
];

function isValidMermaidCode(code) {
  if (!code || code.length < 10) return false;
  const firstWord = code.trim().split(/[\s\n]/)[0].toLowerCase();
  const valid = VALID_MERMAID_STARTS.some(s => firstWord.startsWith(s));
  if (!valid) log(`   ⚠ Invalid mermaid start word: "${firstWord}"`);
  return valid;
}

// ── Fix 1-5: Preprocess all content sections before rendering ─────────────────

function preprocessSections(sections) {
  const cleaned = sections.map(sec => {
    const s = { ...sec };

    // Clean title for every type
    s.title = cleanSlideText(s.title || '');

    // Fix 3: validate mermaid_code — fall back to bullets if invalid
    if (s.type === 'diagram' && !isValidMermaidCode(s.mermaid_code)) {
      log(`   ⚠ Invalid mermaid_code for "${s.title}" — converting to bullets`);
      s.type = 'bullets';
    }

    // Clean type-specific fields
    switch (s.type) {
      case 'bullets':
        s.bullets = (s.bullets || [])
          .map(b => cleanSlideText(b))
          .filter(b => b.length > 0);
        if (s.stat) s.stat = cleanSlideText(s.stat);
        break;
      case 'stats':
        if (s.stat_label)   s.stat_label   = cleanSlideText(s.stat_label);
        if (s.stat_context) s.stat_context = cleanSlideText(s.stat_context);
        break;
      case 'quote':
        s.quote_text   = cleanSlideText(s.quote_text   || '');
        s.quote_author = cleanSlideText(s.quote_author || '');
        break;
    }

    return s;
  });

  // Fix 5: skip slides that are empty after cleaning
  return cleaned.filter(s => {
    if (!s.title) {
      log(`   ⏭ Skipping slide with empty title`);
      return false;
    }
    if (s.type === 'bullets' && (s.bullets || []).length < 2) {
      log(`   ⏭ Skipping empty slide for section: "${s.title}"`);
      return false;
    }
    return true;
  });
}

// ── Step 1: Split script via AI ───────────────────────────────────────────────

async function splitScript(script, topic) {
  const sectionsText = await callAI({
    systemPrompt: `You are creating slide content for a YouTube video. Return ONLY valid JSON — no markdown fences, no explanation.`,
    prompt: `Topic: ${topic || 'YouTube Video'}

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
- diagram: valid Mermaid.js only — prefer flowchart LR (fills horizontal space better), flowchart TD for hierarchies; max 8 nodes, labels 2-4 words, no subgraphs, no style/classDef blocks, escape newlines as \\n
- code: syntactically correct snippet; code_language lowercase (javascript/python/bash/etc.)
- stats: stat_number includes unit/symbol (%, x, M, K); stat_context is one short attribution sentence
- quote: concise and impactful; real attribution in quote_author
- duration_seconds proportional to script length (total ≈ script read at 130 wpm)

IMPORTANT RULES FOR DIAGRAMS:
- If you choose type "diagram" you MUST provide actual valid Mermaid.js code in mermaid_code
- NEVER use placeholder text like "see diagram", "refer to figure", or "see accompanying material" anywhere
- If you cannot generate a real self-contained diagram, use type "bullets" instead
- Every diagram must be fully self-contained and renderable without external context
- Valid Mermaid example:
  flowchart LR
    A[User] --> B[API Gateway]
    B --> C[Auth Service]
    B --> D[Data Service]
    C --> E[Database]
    D --> E`,
    maxTokens: 4096,
    action:    'slide_splitting',
  });

  let text = sectionsText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse slide sections: ${e.message}\nResponse preview: ${sectionsText.substring(0, 300)}`);
  }

  const sections = parsed.sections || parsed;
  console.log(`   ✓ ${sections.length} slides planned`);
  return sections;
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
  const WAIT_MS = { title: 800, bullets: 1500, diagram: 4000, code: 1500, stats: 2000, quote: 1000, thankyou: 800 };

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

    // For diagram slides: scale SVG to fill container; fall back to bullets if too small
    if (sections[i].type === 'diagram') {
      const diagramSize = await page.evaluate(() => {
        const svg       = document.querySelector('.mermaid svg');
        if (!svg) return { width: 0, height: 0 };

        const container = document.querySelector('.diagram-container');
        const cW = container ? container.clientWidth  - 40 : 1160;
        const cH = container ? container.clientHeight - 40 : 380;

        // Read natural dimensions from viewBox or bbox
        let svgW = 0, svgH = 0;
        const vb = svg.viewBox?.baseVal;
        if (vb && vb.width) { svgW = vb.width; svgH = vb.height; }
        if (!svgW) {
          try { const bb = svg.getBBox(); svgW = bb.width; svgH = bb.height; } catch {}
        }
        if (!svgW) { svgW = svg.clientWidth || 400; svgH = svg.clientHeight || 300; }

        if (svgW > 0 && svgH > 0) {
          if (!svg.getAttribute('viewBox')) {
            svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
          }
          const scale = Math.min(cW / svgW, cH / svgH, 2.5);
          svg.style.width    = (svgW * scale) + 'px';
          svg.style.height   = (svgH * scale) + 'px';
          svg.style.maxWidth  = 'none';
          svg.style.maxHeight = 'none';
        }

        const rect = svg.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });

      if (diagramSize.width >= 300) {
        log(`     Mermaid SVG scaled to ${Math.round(diagramSize.width)}×${Math.round(diagramSize.height)}px`);
      } else {
        log(`     ⚠ Diagram too small (${Math.round(diagramSize.width)}px) — falling back to bullets`);
        const fallback = {
          type: 'bullets',
          title: sections[i].title,
          bullets: (sections[i].bullets || []).filter(b => b && b.length > 0),
        };
        const fallbackHtml = buildSlideHTML(fallback, i, sections.length);
        fs.writeFileSync(path.join(SLIDES_DIR, `slide-${i}.html`), fallbackHtml, 'utf8');
        await page.goto(`file://${path.join(SLIDES_DIR, `slide-${i}.html`)}`,
          { waitUntil: 'networkidle0', timeout: 30_000 });
        await page.evaluateHandle('document.fonts.ready');
        await new Promise(r => setTimeout(r, 1500));
      }
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

  // Screenshot CTA overlay (1280×80, deviceScaleFactor:1, transparent bg)
  const ctaHtmlPath = path.join(__dirname, 'cta-overlay.html');
  const ctaPngPath  = path.join(SLIDES_DIR, 'cta-overlay.png');
  if (fs.existsSync(ctaHtmlPath)) {
    const ctaPage = await browser.newPage();
    await ctaPage.setViewport({ width: 940, height: 70, deviceScaleFactor: 1 });
    await ctaPage.goto(`file://${ctaHtmlPath}`, { waitUntil: 'networkidle0', timeout: 15_000 });
    await ctaPage.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 500));
    await ctaPage.screenshot({
      path: ctaPngPath,
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: 940, height: 70 },
    });
    await ctaPage.close();
    log('   ✓ cta-overlay.png');
  }

  await browser.close();
}

// ── Brand palette ─────────────────────────────────────────────────────────────
// TechNuggets by Aseem — deep navy + cyan + gold

const BRAND_FONT = `https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&family=Fira+Code:wght@400;500&display=swap`;

// CSS shared across all content slide types
const SLIDE_BASE_CSS = `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  width:1280px;height:720px;
  background:#0a0e1a;
  font-family:'Inter',system-ui,sans-serif;
  color:#fff;overflow:hidden;position:relative;
}
body::before{
  content:'';position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(0,212,255,.03) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,212,255,.03) 1px,transparent 1px);
  background-size:40px 40px;pointer-events:none;z-index:0;
}
body::after{
  content:'';position:absolute;inset:0;
  background:
    linear-gradient(135deg,rgba(0,212,255,.04) 0%,transparent 50%),
    linear-gradient(315deg,rgba(108,92,231,.04) 0%,transparent 50%);
  pointer-events:none;z-index:0;
}
.top-bar{
  position:absolute;top:0;left:0;right:0;height:3px;z-index:10;
  background:linear-gradient(90deg,#00d4ff 0%,#6c5ce7 50%,#f9a825 100%);
}
.corner-dot{
  position:absolute;width:8px;height:8px;border-radius:50%;
  background:#f9a825;box-shadow:0 0 10px rgba(249,168,37,.6);z-index:10;
}
.corner-dot.tl{top:18px;left:18px;}
.corner-dot.tr{top:18px;right:18px;}
.content{
  position:absolute;left:0;top:0;
  width:1280px;height:720px;
  padding:50px 60px 230px;
  display:flex;flex-direction:column;
  z-index:1;
}
.section-badge{
  display:inline-flex;align-items:center;gap:8px;
  background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.25);
  border-radius:20px;padding:4px 14px;
  font-size:13px;color:#00d4ff;margin-bottom:20px;width:fit-content;
  letter-spacing:.02em;
}
.badge-dot{
  width:6px;height:6px;border-radius:50%;
  background:#00d4ff;box-shadow:0 0 8px #00d4ff;flex-shrink:0;
}
.title{
  font-size:52px;font-weight:700;line-height:1.15;
  color:#fff;margin-bottom:16px;max-width:960px;
  text-shadow:0 0 30px rgba(0,212,255,.15);
}
.title-accent{
  width:60px;height:3px;
  background:linear-gradient(90deg,#00d4ff,#6c5ce7);
  border-radius:2px;margin-bottom:20px;
  box-shadow:0 0 10px rgba(0,212,255,.4);
}
.progress{
  position:absolute;bottom:28px;left:60px;
  display:flex;align-items:center;gap:8px;z-index:2;
}
.dot{width:7px;height:7px;border-radius:50%;background:#1a3a5c;}
.dot.active{width:28px;border-radius:4px;background:#00d4ff;box-shadow:0 0 8px rgba(0,212,255,.5);}
.brand{
  position:absolute;bottom:230px;right:20px;
  font-size:13px;color:#1a3a5c;font-weight:500;
  letter-spacing:.05em;z-index:3;pointer-events:none;
  display:flex;align-items:center;gap:6px;
}
.brand-dot{
  width:6px;height:6px;border-radius:50%;
  background:#f9a825;box-shadow:0 0 6px rgba(249,168,37,.6);
}
`;

function brandingHtml() {
  return `<div class="brand"><div class="brand-dot"></div>TechNuggets by Aseem</div>`;
}

function progressDots(index, total) {
  return Array.from({ length: total }, (_, i) =>
    `<span class="dot${i === index ? ' active' : ''}"></span>`
  ).join('');
}

function sectionLabel(index, total, type) {
  const labels = { bullets:'OVERVIEW', diagram:'ARCHITECTURE', code:'CODE', stats:'BY THE NUMBERS', quote:'KEY INSIGHT', thankyou:'WRAP UP' };
  return `<div class="section-badge"><div class="badge-dot"></div>Section ${index + 1} of ${total} · ${labels[type] || type.toUpperCase()}</div>`;
}

// ── Slide type builders ────────────────────────────────────────────────────────

function buildSlideHTML(section, index, total) {
  switch (section.type) {
    case 'title':    return buildTitleSlide(section);
    case 'thankyou': return buildThankYouSlide();
    case 'diagram':  return buildDiagramSlide(section, index, total);
    case 'code':     return buildCodeSlide(section, index, total);
    case 'stats':    return buildStatsSlide(section, index, total);
    case 'quote':    return buildQuoteSlide(section, index, total);
    default:         return buildBulletsSlide(section, index, total);
  }
}

function buildTitleSlide(section) {
  const date  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const niche = section.niche ? escHtml(section.niche) : '';
  const hook  = section.hook  ? escHtml(section.hook)  : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="${BRAND_FONT}" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  width:1280px;height:720px;
  background:radial-gradient(ellipse at center,#0d1b2e 0%,#0a0e1a 60%,#060810 100%);
  font-family:'Inter',system-ui,sans-serif;
  color:#fff;overflow:hidden;position:relative;
}
.circuit{
  position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(0,212,255,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,212,255,.04) 1px,transparent 1px);
  background-size:40px 40px;pointer-events:none;
}
.top-bar{
  position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,#00d4ff 0%,#6c5ce7 50%,#f9a825 100%);
}
.deco-circle{
  position:absolute;border-radius:50%;border:1px solid;opacity:.12;
}
.deco-1{width:320px;height:320px;top:-80px;left:-80px;border-color:#00d4ff;}
.deco-2{width:220px;height:220px;bottom:-60px;right:-60px;border-color:#6c5ce7;}
.corner-dot{
  position:absolute;width:8px;height:8px;border-radius:50%;
  background:#f9a825;box-shadow:0 0 10px rgba(249,168,37,.6);z-index:10;
}
.corner-dot.tl{top:18px;left:18px;}
.corner-dot.tr{top:18px;right:18px;}
.center{
  position:absolute;inset:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:60px 80px;z-index:1;
}
.niche-pill{
  display:inline-flex;align-items:center;gap:8px;
  background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.25);
  border-radius:30px;padding:8px 20px;
  font-size:15px;color:#00d4ff;margin-bottom:28px;
  letter-spacing:.1em;text-transform:uppercase;
}
.niche-dot{
  width:6px;height:6px;border-radius:50%;
  background:#00d4ff;box-shadow:0 0 8px #00d4ff;flex-shrink:0;
}
.video-title{
  font-size:68px;font-weight:800;line-height:1.1;
  color:#fff;max-width:960px;text-align:center;
  text-shadow:0 0 60px rgba(0,212,255,.2),0 2px 4px rgba(0,0,0,.5);
}
.title-line{
  width:100px;height:4px;
  background:linear-gradient(90deg,#00d4ff,#6c5ce7,#f9a825);
  border-radius:2px;margin:22px auto 20px;
  box-shadow:0 0 20px rgba(0,212,255,.4);
}
.hook-text{
  font-size:22px;color:#a8c8e8;font-style:italic;
  max-width:740px;line-height:1.5;
}
.brand-name{
  position:absolute;bottom:36px;left:50%;transform:translateX(-50%);
  display:flex;align-items:center;gap:10px;
  font-size:18px;font-weight:600;color:#4a6fa5;letter-spacing:.08em;
  white-space:nowrap;
}
.gold-dot{
  width:8px;height:8px;border-radius:50%;
  background:#f9a825;box-shadow:0 0 10px rgba(249,168,37,.7);
}
.date-stamp{
  position:absolute;bottom:40px;right:50px;
  font-size:14px;color:#1a3a5c;
}
</style></head><body>
<div class="circuit"></div>
<div class="top-bar"></div>
<div class="deco-circle deco-1"></div>
<div class="deco-circle deco-2"></div>
<div class="corner-dot tl"></div>
<div class="corner-dot tr"></div>
<div class="center">
  ${niche ? `<div class="niche-pill"><div class="niche-dot"></div>${niche}</div>` : ''}
  <h1 class="video-title">${escHtml(section.title || '')}</h1>
  <div class="title-line"></div>
  ${hook ? `<p class="hook-text">${hook}</p>` : ''}
</div>
<div class="brand-name">
  <div class="gold-dot"></div>TechNuggets by Aseem<div class="gold-dot"></div>
</div>
<div class="date-stamp">${date}</div>
</body></html>`;
}

function buildBulletsSlide(section, index, total) {
  const bullets = (section.bullets || [])
    .map((b, i) => `
    <li class="bullet-item" style="animation-delay:${(i + 1) * 0.2}s">
      <div class="bullet-dot"></div>
      <span>${escHtml(b)}</span>
    </li>`)
    .join('');
  const stat = section.stat
    ? `<div class="stat-callout">${escHtml(section.stat)}</div>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="${BRAND_FONT}" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
@keyframes slideIn{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
.bullet-item{
  display:flex;align-items:flex-start;gap:14px;
  font-size:28px;color:#a8c8e8;line-height:1.4;
  opacity:0;animation:slideIn 0.4s ease forwards;
  margin-bottom:16px;
}
.bullet-dot{
  width:8px;height:8px;border-radius:50%;
  background:#00d4ff;box-shadow:0 0 8px rgba(0,212,255,.6);
  flex-shrink:0;margin-top:10px;
}
.stat-callout{
  background:rgba(0,212,255,.06);border-left:3px solid #00d4ff;
  padding:14px 20px;border-radius:0 6px 6px 0;
  font-size:19px;font-weight:600;color:#00d4ff;font-style:italic;
  line-height:1.45;max-width:820px;
  opacity:0;animation:slideIn 0.4s ease 1s forwards;
}
</style></head><body>
<div class="top-bar"></div>
<div class="corner-dot tl"></div>
<div class="corner-dot tr"></div>
<div class="content">
  ${sectionLabel(index, total, 'bullets')}
  <h1 class="title">${escHtml(section.title)}</h1>
  <div class="title-accent"></div>
  <ul style="list-style:none;">${bullets}</ul>
  ${stat}
</div>
<div class="progress">${progressDots(index, total)}</div>
${brandingHtml()}
</body></html>`;
}

function buildDiagramSlide(section, index, total) {
  // Raw mermaid — do NOT html-escape; Mermaid needs literal characters
  const mermaidCode = (section.mermaid_code || 'flowchart LR\n  A[Input] --> B[Process]\n  B --> C[Output]').trim();

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="${BRAND_FONT}" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
.type-label{
  position:absolute;top:16px;left:60px;
  font-size:11px;font-weight:600;color:#00d4ff;
  letter-spacing:.14em;text-transform:uppercase;
  display:flex;align-items:center;gap:6px;z-index:10;
}
.type-dot{width:6px;height:6px;border-radius:50%;background:#00d4ff;box-shadow:0 0 8px #00d4ff;}
.slide-title{
  position:absolute;top:34px;left:60px;right:400px;
  font-size:40px;font-weight:700;color:#ffffff;line-height:1.2;z-index:10;
  text-shadow:0 0 30px rgba(0,212,255,.15);
}
.diagram-container{
  position:absolute;top:95px;left:40px;right:40px;bottom:225px;
  background:rgba(13,27,46,.8);border:1px solid rgba(0,212,255,.15);
  border-radius:8px;display:flex;align-items:center;justify-content:center;
  overflow:hidden;padding:20px;z-index:5;
}
.mermaid{width:100%;height:100%;display:flex;align-items:center;justify-content:center;}
.progress-row{position:absolute;bottom:205px;left:60px;display:flex;gap:6px;align-items:center;z-index:10;}
.brand-row{position:absolute;bottom:208px;right:24px;font-size:11px;color:#1a3a5c;
  font-weight:500;letter-spacing:.05em;display:flex;align-items:center;gap:5px;z-index:10;}
.brand-dot{width:5px;height:5px;border-radius:50%;background:#f9a825;box-shadow:0 0 5px rgba(249,168,37,.5);}
</style>
</head><body>
<div class="top-bar"></div>
<div class="corner-dot tl"></div>
<div class="corner-dot tr"></div>
<div class="type-label"><div class="type-dot"></div>Diagram</div>
<div class="slide-title">${escHtml(section.title)}</div>
<div class="diagram-container">
  <div class="mermaid">${mermaidCode}</div>
</div>
<div class="progress-row">${progressDots(index, total)}</div>
<div class="brand-row"><div class="brand-dot"></div>TechNuggets by Aseem</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
mermaid.initialize({
  startOnLoad: true,
  theme: 'dark',
  fontSize: 20,
  flowchart: { nodeSpacing: 60, rankSpacing: 80, padding: 24, useMaxWidth: false, htmlLabels: true },
  themeVariables: {
    fontSize: '20px',
    fontFamily: 'Inter, sans-serif',
    primaryColor: '#0d1b2e',
    primaryTextColor: '#00d4ff',
    primaryBorderColor: '#00d4ff',
    lineColor: '#4a6fa5',
    secondaryColor: '#0f2040',
    background: '#0a0e1a',
    mainBkg: '#0d1b2e',
    nodeBorder: '#00d4ff',
    titleColor: '#ffffff',
    edgeLabelBackground: '#0a0e1a',
  }
});
</script>
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
<link href="${BRAND_FONT}" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
.code-outer{position:relative;flex:1;max-width:1060px;}
.lang-badge{
  position:absolute;top:16px;right:16px;
  background:rgba(0,212,255,.15);border:1px solid rgba(0,212,255,.4);
  color:#00d4ff;
  padding:4px 12px;border-radius:4px;
  font-size:14px;font-weight:700;letter-spacing:.5px;
  z-index:1;
}
pre{
  background:#0d1b2e;border-radius:8px;
  padding:28px 30px;margin:0;overflow:hidden;
  border:1px solid #1a3a5c;
  border-left:3px solid #00d4ff;
}
code{
  font-family:'Fira Code','Courier New',monospace;
  font-size:21px;line-height:1.65;
  color:#a8c8e8;white-space:pre;
  display:block;
}
</style></head><body>
<div class="top-bar"></div>
<div class="corner-dot tl"></div>
<div class="corner-dot tr"></div>
<div class="content">
  ${sectionLabel(index, total, 'code')}
  <h1 class="title">${escHtml(section.title)}</h1>
  <div class="title-accent"></div>
  <div class="code-outer">
    <div class="lang-badge">${escHtml(lang.toUpperCase())}</div>
    <pre><code>${escapedCode}</code></pre>
  </div>
</div>
<div class="progress">${progressDots(index, total)}</div>
${brandingHtml()}
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
<link href="${BRAND_FONT}" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.stat-number{
  font-size:140px;font-weight:900;line-height:1;
  color:#00d4ff;letter-spacing:-4px;margin-bottom:14px;
  font-variant-numeric:tabular-nums;
  text-shadow:0 0 40px rgba(0,212,255,.5);
}
.stat-label{
  font-size:32px;font-weight:600;color:#a8c8e8;
  max-width:780px;line-height:1.3;margin-bottom:12px;
  animation:fadeUp 0.5s ease 0.6s both;
}
.stat-context{
  font-size:17px;color:#4a6fa5;max-width:640px;line-height:1.5;
  animation:fadeUp 0.5s ease 1s both;
}
</style></head><body>
<div class="top-bar"></div>
<div class="corner-dot tl"></div>
<div class="corner-dot tr"></div>
<div class="content">
  ${sectionLabel(index, total, 'stats')}
  <h1 class="title">${escHtml(section.title)}</h1>
  <div class="title-accent"></div>
  <div class="stat-number" id="stat-num">${startDisplay}</div>
  <div class="stat-label">${escHtml(label)}</div>
  ${context ? `<div class="stat-context">${escHtml(context)}</div>` : ''}
</div>
<div class="progress">${progressDots(index, total)}</div>
${brandingHtml()}
${countUpScript}
</body></html>`;
}

function buildQuoteSlide(section, index, total) {
  const text   = section.quote_text   || '';
  const author = section.quote_author || '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="${BRAND_FONT}" rel="stylesheet">
<style>
${SLIDE_BASE_CSS}
body{background:radial-gradient(ellipse at 30% 50%,#0d1b2e 0%,#0a0e1a 70%);}
@keyframes fadeIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.quote-wrap{
  flex:1;display:flex;flex-direction:column;justify-content:center;
  max-width:900px;animation:fadeIn 0.7s ease forwards;
}
.quote-mark{
  font-size:110px;line-height:.65;font-family:Georgia,serif;
  color:rgba(0,212,255,.2);margin-bottom:6px;display:block;
}
.quote-text{
  font-size:38px;font-style:italic;font-weight:600;
  line-height:1.45;color:#e8e8e8;margin-bottom:28px;max-width:840px;
}
.quote-author{
  font-size:19px;font-weight:700;color:#00d4ff;letter-spacing:.5px;
}
.quote-author::before{content:'— ';}
</style></head><body>
<div class="top-bar"></div>
<div class="corner-dot tl"></div>
<div class="corner-dot tr"></div>
<div class="content">
  ${sectionLabel(index, total, 'quote')}
  <div class="quote-wrap">
    <span class="quote-mark">"</span>
    <p class="quote-text">${escHtml(text)}</p>
    <span class="quote-author">${escHtml(author)}</span>
  </div>
</div>
<div class="progress">${progressDots(index, total)}</div>
${brandingHtml()}
</body></html>`;
}

// ── Part 4: Thank You slide ────────────────────────────────────────────────────

function buildThankYouSlide() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="${BRAND_FONT}" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{
  width:1280px;height:720px;
  background:radial-gradient(ellipse at center,#0d1b2e 0%,#0a0e1a 60%,#060810 100%);
  font-family:'Inter',system-ui,sans-serif;
  color:#fff;overflow:hidden;position:relative;
}
.circuit{
  position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(0,212,255,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,212,255,.04) 1px,transparent 1px);
  background-size:40px 40px;pointer-events:none;
}
.top-bar{
  position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,#00d4ff 0%,#6c5ce7 50%,#f9a825 100%);
}
.corner-dot{
  position:absolute;width:8px;height:8px;border-radius:50%;
  background:#f9a825;box-shadow:0 0 10px rgba(249,168,37,.6);z-index:10;
}
.corner-dot.tl{top:18px;left:18px;}
.corner-dot.tr{top:18px;right:18px;}
.center{
  position:absolute;inset:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;z-index:1;padding:60px;
}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.thanks-label{
  font-size:14px;font-weight:700;letter-spacing:.3em;
  color:#00d4ff;text-transform:uppercase;margin-bottom:20px;
  animation:fadeUp .5s ease .1s both;
}
.thanks-title{
  font-size:88px;font-weight:800;
  background:linear-gradient(135deg,#ffffff 0%,#a8c8e8 50%,#00d4ff 100%);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
  margin-bottom:12px;
  animation:fadeUp .5s ease .25s both;
  text-shadow:none;
}
.thanks-sub{
  font-size:22px;color:#4a6fa5;margin-bottom:36px;
  animation:fadeUp .5s ease .4s both;
}
.action-row{
  display:flex;gap:28px;align-items:center;justify-content:center;
  animation:fadeUp .5s ease .55s both;
}
.action-pill{
  display:flex;align-items:center;gap:10px;
  background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.25);
  border-radius:30px;padding:10px 22px;
  font-size:18px;color:#a8c8e8;
}
.action-icon{font-size:22px;}
.title-line{
  width:80px;height:3px;
  background:linear-gradient(90deg,#00d4ff,#6c5ce7,#f9a825);
  border-radius:2px;margin:0 auto 28px;
  box-shadow:0 0 20px rgba(0,212,255,.4);
  animation:fadeUp .5s ease .2s both;
}
.brand-name{
  position:absolute;bottom:36px;left:50%;transform:translateX(-50%);
  display:flex;align-items:center;gap:10px;
  font-size:18px;font-weight:600;color:#4a6fa5;letter-spacing:.08em;
  white-space:nowrap;
}
.gold-dot{
  width:8px;height:8px;border-radius:50%;
  background:#f9a825;box-shadow:0 0 10px rgba(249,168,37,.7);
}
</style></head><body>
<div class="circuit"></div>
<div class="top-bar"></div>
<div class="corner-dot tl"></div>
<div class="corner-dot tr"></div>
<div class="center">
  <div class="thanks-label">That's a wrap</div>
  <div class="thanks-title">Thank You</div>
  <div class="title-line"></div>
  <div class="thanks-sub">If this helped you, the like button is right there 👇</div>
  <div class="action-row">
    <div class="action-pill"><span class="action-icon">👍</span> Like</div>
    <div class="action-pill"><span class="action-icon">🔔</span> Subscribe</div>
    <div class="action-pill"><span class="action-icon">💬</span> Comment</div>
  </div>
</div>
<div class="brand-name">
  <div class="gold-dot"></div>TechNuggets by Aseem<div class="gold-dot"></div>
</div>
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
  const TITLE_DUR  = 30; // title slide: 30 s
  const THANKS_DUR = 8;  // thank you slide: 8 s
  const locked     = TITLE_DUR + THANKS_DUR;
  const content    = sections.filter(s => s.type !== 'title' && s.type !== 'thankyou');
  const remaining  = Math.max(totalDuration - locked, content.length * 1.5);
  const sum        = content.reduce((a, s) => a + (s.duration_seconds || 30), 0);
  return sections.map(s => {
    if (s.type === 'title')    return { ...s, duration: TITLE_DUR };
    if (s.type === 'thankyou') return { ...s, duration: THANKS_DUR };
    return { ...s, duration: Math.max(((s.duration_seconds || 30) / sum) * remaining, 1.5) };
  });
}

// ── Step 6: Composite ──────────────────────────────────────────────────────────

async function composite(ffmpeg, ffprobe, sections, heygenPath, outPath) {
  const FPS  = 30;
  const FADE = 0.5;
  const totalDuration = sections.reduce((sum, s) => sum + s.duration, 0);

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
      `-vf "scale=1280:720:flags=lanczos,` +
           `fade=t=in:st=0:d=${FADE},` +
           `fade=t=out:st=${fadeOutStart}:d=${FADE}" ` +
      `-t ${dur.toFixed(3)} -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p "${seg}"`,
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
    ? `[1:v]scale=-2:${PIP_HEIGHT}:flags=lanczos[av_scaled]`
    : `[1:v]scale=${PIP_WIDTH}:-2:flags=lanczos[av_scaled]`;

  const ctaPngPath = path.join(SLIDES_DIR, 'cta-overlay.png');
  const hasCta     = fs.existsSync(ctaPngPath);

  // CTA bar: appears 30s before end, disappears when Thank You slide starts (last 8s)
  const ctaStart = Math.max(0, totalDuration - 30).toFixed(3);
  const ctaEnd   = Math.max(0, totalDuration - 8).toFixed(3);

  // Build filter_complex as a clean chain.
  // When CTA exists: [with_pip][2:v]overlay feeds the PNG into the composite.
  // The overlay filter requires two pads — background then overlay image.
  const filterComplex = hasCta
    ? [
        `[0:v]scale=1280:720:flags=lanczos[bg]`,
        `${pipScaleFilter}`,
        `[av_scaled]pad=iw+4:ih+4:2:2:color=white[av_bordered]`,
        `[bg][av_bordered]overlay=${overlayExpr}[with_pip]`,
        `[with_pip][2:v]overlay=0:440:enable='between(t,${ctaStart},${ctaEnd})'[outv]`,
      ].join(';')
    : [
        `[0:v]scale=1280:720:flags=lanczos[bg]`,
        `${pipScaleFilter}`,
        `[av_scaled]pad=iw+4:ih+4:2:2:color=white[av_bordered]`,
        `[bg][av_bordered]overlay=${overlayExpr}[outv]`,
      ].join(';');

  const inputs = [
    '-i', slideshowPath,
    '-i', heygenPath,
    ...(hasCta ? ['-i', ctaPngPath] : []),
  ];

  const audioMapArgs = hasAudio
    ? ['-map', '[outv]', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k']
    : ['-map', '[outv]', '-an'];

  const ffmpegArgs = [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-c:v', 'libx264',
    '-crf', '18',
    '-preset', 'slow',
    '-pix_fmt', 'yuv420p',
    ...audioMapArgs,
    outPath,
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stderr.on('data', (data) => {
      const line = data.toString();
      if (line.includes('Error') || line.includes('error') || line.includes('time=')) {
        log(`   FFmpeg: ${line.trim()}`);
      }
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        log(`❌ FFmpeg failed with code: ${code}`);
        log(`   Command: ${ffmpeg} ${ffmpegArgs.join(' ')}`);
        reject(new Error(`FFmpeg exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });

  log(`   ✓ ${path.basename(outPath)} written (PIP: ${PIP_POSITION}${hasCta ? ', CTA overlay active' : ''})`);
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
