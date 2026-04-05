/**
 * highlight.js — Cut a 60-second vertical highlight clip from the latest video.
 *
 * Usage:
 *   node highlight.js <video.mp4> [script.txt]
 *   node highlight.js "Kubernetes Best Practices_1080p.mp4"
 *
 * Requires:
 *   - ffmpeg installed and on PATH
 *   - ANTHROPIC_API_KEY environment variable
 *
 * Output: highlight_clip.mp4 (1080×1920 vertical, ready for TikTok/Reels/Shorts)
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY    = process.env.ANTHROPIC_API_KEY || '';
const VIDEO_PATH = process.argv[2] || findLatestVideo();
const WPM        = 150;     // words per minute speaking pace

// ── Validate ──────────────────────────────────────────────────────────────────

if (!API_KEY) {
  console.error('\n❌  ANTHROPIC_API_KEY environment variable not set.');
  console.error('    Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

if (!VIDEO_PATH || !fs.existsSync(VIDEO_PATH)) {
  console.error(`\n❌  Video file not found: ${VIDEO_PATH || '(none provided)'}`);
  console.error('    Usage: node highlight.js <video.mp4>\n');
  process.exit(1);
}

// Check ffmpeg
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
} catch {
  console.error('\n❌  ffmpeg not found. Install it with: brew install ffmpeg\n');
  process.exit(1);
}

console.log(`\n🎬  Highlight clip generator`);
console.log(`📹  Video: ${VIDEO_PATH}`);

// ── Load script ───────────────────────────────────────────────────────────────

function loadScript() {
  // 1. Explicit path argument
  if (process.argv[3] && fs.existsSync(process.argv[3])) {
    return fs.readFileSync(process.argv[3], 'utf8');
  }
  // 2. render-input.json in same directory
  const renderInput = path.join(__dirname, 'render-input.json');
  if (fs.existsSync(renderInput)) {
    try {
      const data = JSON.parse(fs.readFileSync(renderInput, 'utf8'));
      if (data.script) {
        console.log('📄  Script loaded from render-input.json');
        return data.script;
      }
    } catch {}
  }
  return null;
}

// ── Claude API call ───────────────────────────────────────────────────────────

function claudeRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':     'application/json',
        'x-api-key':        API_KEY,
        'anthropic-version':'2023-06-01',
        'Content-Length':   Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error(`Claude API ${res.statusCode}: ${parsed?.error?.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}\nBody: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Find timestamp from word position ─────────────────────────────────────────

function wordsToSeconds(script, searchText) {
  if (!script || !searchText) return 0;
  const idx = script.toLowerCase().indexOf(searchText.toLowerCase().slice(0, 40));
  if (idx < 0) return 0;
  const wordsBefore = script.slice(0, idx).trim().split(/\s+/).length;
  return Math.round((wordsBefore / WPM) * 60);
}

// ── FFmpeg helpers ────────────────────────────────────────────────────────────

function getVideoDuration(videoPath) {
  try {
    const out = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf8' }
    );
    return parseFloat(out.trim()) || 0;
  } catch {
    return 0;
  }
}

function cutHighlightClip({ videoPath, startSec, durationSec, outputPath, caption }) {
  const duration     = getVideoDuration(videoPath);
  const safeStart    = Math.max(0, Math.min(startSec, duration - durationSec - 2));
  const safeDuration = Math.min(durationSec, duration - safeStart);

  console.log(`✂️   Cutting ${safeDuration}s from ${safeStart}s`);

  // Step 1: cut + reformat to 1080×1920 vertical
  const tempPath = outputPath.replace('.mp4', '_temp.mp4');
  const cutCmd = [
    'ffmpeg', '-y',
    '-ss', String(safeStart),
    '-i', `"${videoPath}"`,
    '-t', String(safeDuration),
    '-c:v', 'libx264', '-c:a', 'aac',
    '-vf', '"scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"',
    '-movflags', '+faststart',
    `"${tempPath}"`,
  ].join(' ');

  console.log('🔧  Reformatting to 1080×1920…');
  const cutResult = spawnSync('sh', ['-c', cutCmd], { stdio: 'pipe' });
  if (cutResult.status !== 0) {
    throw new Error(`FFmpeg cut failed:\n${cutResult.stderr?.toString()}`);
  }

  // Step 2: add caption overlay if provided
  if (caption) {
    const lines = caption.split('\n').slice(0, 3);

    // Escape special chars for drawtext
    const escapeDrawtext = s => s.replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]');

    const drawFilters = lines.map((line, i) => {
      const y = 1920 - 320 + (i * 80);
      return `drawtext=text='${escapeDrawtext(line)}':fontsize=52:fontcolor=white:` +
             `x=(w-text_w)/2:y=${y}:box=1:boxcolor=black@0.6:boxborderw=10`;
    }).join(',');

    // Step 3: add "Watch full video →" overlay in last 3 seconds
    const watchFilter = `drawtext=text='Watch full video →':fontsize=44:fontcolor=yellow:` +
                        `x=(w-text_w)/2:y=120:box=1:boxcolor=black@0.5:boxborderw=8:` +
                        `enable='gte(t,${safeDuration - 3})'`;

    const overlayCmd = [
      'ffmpeg', '-y',
      '-i', `"${tempPath}"`,
      '-vf', `"${drawFilters},${watchFilter}"`,
      '-c:a', 'copy',
      '-movflags', '+faststart',
      `"${outputPath}"`,
    ].join(' ');

    console.log('💬  Adding caption overlay…');
    const overlayResult = spawnSync('sh', ['-c', overlayCmd], { stdio: 'pipe' });

    if (overlayResult.status !== 0) {
      // Caption failed — just use the unstyled clip
      console.warn('⚠️   Caption overlay failed, using clip without captions');
      fs.renameSync(tempPath, outputPath);
    } else {
      fs.unlinkSync(tempPath);
    }
  } else {
    fs.renameSync(tempPath, outputPath);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const script = loadScript();
  const outputPath = path.join(path.dirname(VIDEO_PATH), 'highlight_clip.mp4');

  let startSec = 0;
  let caption  = '';

  if (script && script.length > 200) {
    console.log('🤖  Asking Claude to find the best 60-second segment…');

    try {
      const res = await claudeRequest({
        model:      'claude-opus-4-5',
        max_tokens: 500,
        system:     'You are a video editor specialising in short-form viral content. Return ONLY valid JSON.',
        messages: [{
          role: 'user',
          content: `Analyse this YouTube video script and find the single most compelling 60-second segment (~150 words) that:
- Makes a strong standalone point
- Contains a surprising stat, insight, or counterintuitive idea
- Works without any context from the rest of the video
- Has a natural start and end

Script:
${script.slice(0, 8000)}

Return JSON:
{
  "start_text": "exact first 10 words of the segment",
  "end_text": "exact last 8 words of the segment",
  "reason": "why this segment works standalone",
  "suggested_caption": "line1\\nline2\\nline3"
}`,
        }],
      });

      const text    = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const match   = text.match(/```(?:json)?\s*([\s\S]+?)```/) || text.match(/(\{[\s\S]+\})/);
      const parsed  = match ? JSON.parse(match[1]) : {};

      console.log(`\n📌  Best segment:`);
      console.log(`    Starts: "${parsed.start_text}"`);
      console.log(`    Reason: ${parsed.reason}`);

      startSec = wordsToSeconds(script, parsed.start_text || '');
      caption  = parsed.suggested_caption || '';

      console.log(`⏱️   Estimated start time: ${startSec}s`);
    } catch (err) {
      console.warn(`⚠️   Claude analysis failed: ${err.message}`);
      console.log('    Falling back to 30% into the video…');
      const duration = getVideoDuration(VIDEO_PATH);
      startSec = Math.round(duration * 0.3);
    }
  } else {
    console.log('ℹ️   No script found — cutting from 30% into video');
    const duration = getVideoDuration(VIDEO_PATH);
    startSec = Math.round(duration * 0.3);
  }

  cutHighlightClip({
    videoPath:   VIDEO_PATH,
    startSec,
    durationSec: 60,
    outputPath,
    caption,
  });

  console.log(`\n✅  Highlight clip saved: ${outputPath}`);
  console.log(`\n📱  Upload to:`);
  console.log(`    • TikTok:           tiktok.com/upload`);
  console.log(`    • Instagram Reels:  instagram.com → Create → Reel`);
  console.log(`    • Twitter / X:      Attach video to a tweet`);
  console.log(`    • YouTube Shorts:   Upload as a Short (≤60s)\n`);
}

// ── Find latest video ─────────────────────────────────────────────────────────

function findLatestVideo() {
  try {
    const files = fs.readdirSync(__dirname)
      .filter(f => f.endsWith('.mp4') && !f.includes('highlight'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(__dirname, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length ? path.join(__dirname, files[0].name) : null;
  } catch {
    return null;
  }
}

main().catch(err => {
  console.error(`\n❌  ${err.message}\n`);
  process.exit(1);
});
