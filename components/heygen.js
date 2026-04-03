/**
 * HeyGen Video Generation Component — Step 3 (Hybrid Manual Workflow)
 *
 * Stage A — Copy cleaned script → paste into heygen.com manually
 * Stage B — Upload the MP4 you downloaded from HeyGen
 * Stage C — Optional: run render.js locally to add slides (PIP)
 */

import { getSettings } from './settings.js';
import { cleanScript }  from './clean-script.js';

export function renderHeyGen(container) {
  container.innerHTML = `

    <!-- ── Stage A: Copy Script ───────────────────────────────────────────── -->
    <div class="card">
      <h2>Step 1 — Copy Script for HeyGen</h2>
      <p style="font-size:0.88rem;color:var(--muted);margin-bottom:16px;">
        Markdown and stage directions have been stripped so the AI avatar
        reads naturally. Copy, paste into HeyGen, and generate your video.
      </p>

      <div class="form-group">
        <label for="hg-script">
          Cleaned Script
          <span style="color:var(--muted);font-weight:400;"> — ready to paste into HeyGen</span>
        </label>
        <textarea id="hg-script" rows="10" readonly
          style="font-family:inherit;font-size:0.88rem;resize:vertical;
                 background:var(--surface2);color:var(--text);"
          placeholder="Script auto-filled from Step 2, or paste your raw script here…"></textarea>
      </div>

      <div id="hg-script-meta" style="font-size:0.82rem;color:var(--muted);margin-bottom:14px;"></div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="hg-copy-btn">Copy Cleaned Script</button>
        <a href="https://www.heygen.com" target="_blank" rel="noopener"
          class="btn btn-secondary">Open HeyGen ↗</a>
        <button class="btn btn-secondary" id="hg-preview-slides-btn">📋 Preview Slides</button>
      </div>

      <div id="hg-slides-preview" style="display:none;margin-top:20px;"></div>

      <div class="status-bar info"
        style="flex-direction:column;align-items:flex-start;gap:8px;margin-top:16px;padding:16px;">
        <strong style="font-size:0.9rem;">How to generate your video on HeyGen:</strong>
        <ol style="padding-left:20px;font-size:0.84rem;line-height:2.2;color:var(--text);">
          <li>Click <strong>Copy Cleaned Script</strong> above</li>
          <li>Go to <strong>heygen.com → Create Video → Talking Photo / Avatar</strong></li>
          <li>Paste the script into the text box</li>
          <li>Select your avatar and voice</li>
          <li>Click <strong>Generate</strong> — takes 10–15 minutes</li>
          <li>Download the MP4 when ready, then come back here ↓</li>
        </ol>
      </div>
    </div>

    <!-- ── Stage B: Upload MP4 ───────────────────────────────────────────── -->
    <div class="card">
      <h2>Step 2 — Upload Your HeyGen Video</h2>
      <p style="font-size:0.88rem;color:var(--muted);margin-bottom:16px;">
        Drag and drop the MP4 you downloaded from HeyGen, or click to browse.
      </p>

      <div id="hg-drop-zone" class="drop-zone">
        <input type="file" id="hg-file-input" accept=".mp4,video/mp4" style="display:none;">
        <div class="drop-zone-inner">
          <div style="font-size:2rem;margin-bottom:8px;">🎬</div>
          <p style="font-weight:600;margin-bottom:4px;">Drop your HeyGen MP4 here</p>
          <p style="font-size:0.83rem;color:var(--muted);">
            or <button class="link-btn" id="hg-browse-btn" type="button">browse files</button>
          </p>
        </div>
      </div>

      <div id="hg-file-info" style="display:none;margin-top:12px;">
        <div style="display:flex;align-items:center;gap:12px;
                    background:var(--surface2);border:1px solid var(--border);
                    border-radius:var(--radius);padding:12px 16px;">
          <span style="font-size:1.4rem;">🎞</span>
          <div style="flex:1;min-width:0;">
            <div id="hg-fname" style="font-weight:600;font-size:0.9rem;
                 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
            <div id="hg-fsize" style="font-size:0.8rem;color:var(--muted);"></div>
          </div>
          <button class="btn btn-secondary" id="hg-file-clear"
            style="padding:4px 10px;font-size:0.8rem;">✕ Clear</button>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
          <button class="btn btn-primary" id="hg-enhance-btn">
            ✨ Enhance with Slides
          </button>
          <button class="btn btn-success" id="hg-upload-direct-btn">
            → Proceed to YouTube Upload
          </button>
        </div>
      </div>
    </div>

    <!-- ── Stage C: Rendering ────────────────────────────────────────────── -->
    <div id="hg-render-card" style="display:none;" class="card">
      <h2>Step 3 — Rendering with Slides</h2>
      <p style="font-size:0.88rem;color:var(--muted);margin-bottom:16px;">
        Run this command in your terminal — it uses FFmpeg + Puppeteer to
        composite your slides as a background with the avatar as PIP.
      </p>

      <div style="background:#0a0a0a;border:1px solid var(--border);border-radius:6px;
                  padding:14px 18px;font-family:monospace;font-size:0.92rem;
                  display:flex;align-items:center;justify-content:space-between;gap:12px;
                  margin-bottom:20px;">
        <span style="color:#7af57a;">npm run render</span>
        <button class="btn btn-secondary" id="hg-copy-cmd-btn"
          style="font-size:0.78rem;padding:4px 10px;">Copy</button>
      </div>

      <ul class="render-steps" id="hg-render-steps">
        <li class="render-step" data-step="0">
          <span class="step-icon pending">○</span>
          <span>Splitting script into sections</span>
        </li>
        <li class="render-step" data-step="1">
          <span class="step-icon pending">○</span>
          <span>Generating slides</span>
        </li>
        <li class="render-step" data-step="2">
          <span class="step-icon pending">○</span>
          <span>Rendering slides to images</span>
        </li>
        <li class="render-step" data-step="3">
          <span class="step-icon pending">○</span>
          <span>Compositing video</span>
        </li>
        <li class="render-step" data-step="4">
          <span class="step-icon pending">○</span>
          <span>Done!</span>
        </li>
      </ul>

      <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border);">
        <label style="font-size:0.88rem;font-weight:600;display:block;margin-bottom:8px;">
          When render is complete — select <code>final-video.mp4</code>:
        </label>
        <input type="file" id="hg-rendered-file" accept=".mp4,video/*"
          style="color:var(--text);font-size:0.86rem;" />
        <div id="hg-render-ready-status"
          style="display:none;font-size:0.85rem;color:#7af57a;margin-top:8px;">
          ✓ Rendered video loaded — proceeding to Upload tab…
        </div>
      </div>
    </div>
  `;

  // ── State ──────────────────────────────────────────────────────────────────
  container._topic      = '';
  container._rawScript  = '';
  container._videoId    = '';
  container._fileObj    = null;   // File object from drop zone
  container._fileObjUrl = '';     // Blob URL for the dropped file

  // ── Stage A: populate script ───────────────────────────────────────────────
  container._setScript = (rawScript) => {
    container._rawScript = rawScript || '';
    const cleaned = cleanScript(rawScript || '');
    container.querySelector('#hg-script').value = cleaned;
    updateScriptMeta(container, cleaned);
  };

  container.querySelector('#hg-preview-slides-btn').addEventListener('click', () => {
    previewSlides(container);
  });

  container.querySelector('#hg-copy-btn').addEventListener('click', () => {
    const text = container.querySelector('#hg-script').value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = container.querySelector('#hg-copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Cleaned Script'; }, 1800);
    });
  });

  // Allow pasting raw script into the textarea (re-clean on input)
  container.querySelector('#hg-script').addEventListener('input', (e) => {
    // textarea is readonly by default; remove readonly to allow paste
    const cleaned = cleanScript(e.target.value);
    e.target.value = cleaned;
    updateScriptMeta(container, cleaned);
  });
  // Make it editable (remove readonly — user might want to tweak)
  container.querySelector('#hg-script').removeAttribute('readonly');

  // ── Stage B: drag-and-drop ─────────────────────────────────────────────────
  const dropZone  = container.querySelector('#hg-drop-zone');
  const fileInput = container.querySelector('#hg-file-input');

  container.querySelector('#hg-browse-btn').addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) setFile(container, file);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) setFile(container, file);
  });

  container.querySelector('#hg-file-clear').addEventListener('click', () => clearFile(container));

  // "Proceed to YouTube Upload" — direct upload without slides
  container.querySelector('#hg-upload-direct-btn').addEventListener('click', () => {
    if (!container._fileObj) return;
    fireVideoComplete(container, container._fileObjUrl);
  });

  // "Enhance with Slides" — download render files + show Stage C
  container.querySelector('#hg-enhance-btn').addEventListener('click', () => {
    prepareRenderFiles(container);
    container.querySelector('#hg-render-card').style.display = 'block';
    container.querySelector('#hg-render-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    animateRenderSteps(container);
  });

  // Copy terminal command
  container.querySelector('#hg-copy-cmd-btn').addEventListener('click', () => {
    navigator.clipboard.writeText('npm run render').then(() => {
      const btn = container.querySelector('#hg-copy-cmd-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });

  // Stage C: select rendered file
  container.querySelector('#hg-rendered-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    container.querySelector('#hg-render-ready-status').style.display = 'block';
    setTimeout(() => fireVideoComplete(container, url), 800);
  });

  // Listen for send-to-video from Tab 2
  document.addEventListener('send-to-video', (e) => {
    const { script, topic } = e.detail || {};
    if (topic)  container._topic = topic;
    if (script) container._setScript(script);
  });
}

// ── Slide Preview ──────────────────────────────────────────────────────────────

const TYPE_ICONS = { diagram:'📊', code:'💻', stats:'📈', quote:'💬', bullets:'📝' };

async function previewSlides(container) {
  const script = container.querySelector('#hg-script').value.trim();
  const topic  = container._topic || '';
  const previewEl = container.querySelector('#hg-slides-preview');
  const btn    = container.querySelector('#hg-preview-slides-btn');

  if (!script) {
    previewEl.style.display = 'block';
    previewEl.innerHTML = `<div class="status-bar error">Paste or generate a script first.</div>`;
    return;
  }

  const { claudeApiKey } = getSettings();
  if (!claudeApiKey) {
    previewEl.style.display = 'block';
    previewEl.innerHTML = `<div class="status-bar error">Add your Anthropic API key in ⚙ Settings to preview slides.</div>`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> Analysing…';
  previewEl.style.display = 'block';
  previewEl.innerHTML = `<div class="status-bar info"><span class="loader"></span> Asking Claude to plan slide layout…</div>`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: `You are planning slides for a YouTube video.

Topic: ${topic || 'YouTube Video'}

Script (first 3000 chars):
"""
${script.slice(0, 3000)}
"""

Split into 5-8 sections. For each section choose the best slide type:
- "diagram"  — for flows, processes, comparisons
- "code"     — when implementation or commands are discussed
- "stats"    — when a compelling number anchors the section
- "quote"    — for key insights or expert opinions
- "bullets"  — default for general explanations

Return ONLY valid JSON, no markdown fences:
{"sections":[{"title":"slide title (4-7 words)","type":"bullets","duration_seconds":30}]}`,
        }],
      }),
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    let raw = (data.content?.find(b => b.type === 'text')?.text || '').trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const sections = JSON.parse(raw).sections || [];

    renderSlidePreviewGrid(previewEl, sections);
  } catch (err) {
    previewEl.innerHTML = `<div class="status-bar error">${escHtmlHeyGen(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '📋 Preview Slides';
  }
}

function renderSlidePreviewGrid(el, sections) {
  const totalSecs = sections.reduce((s, sec) => s + (sec.duration_seconds || 30), 0);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;

  el.innerHTML = `
    <div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <strong style="font-size:0.95rem;">
        ${sections.length} slides · Est. ${mins}m${secs > 0 ? ` ${secs}s` : ''}
      </strong>
      <span style="font-size:0.82rem;color:var(--muted);">
        ${sections.filter(s=>s.type==='diagram').length} diagrams ·
        ${sections.filter(s=>s.type==='code').length} code ·
        ${sections.filter(s=>s.type==='stats').length} stats ·
        ${sections.filter(s=>s.type==='quote').length} quotes ·
        ${sections.filter(s=>!s.type||s.type==='bullets').length} bullets
      </span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;">
      ${sections.map((s, i) => {
        const type = s.type || 'bullets';
        const icon = TYPE_ICONS[type] || '📝';
        return `
          <div style="background:var(--surface2);border:1px solid var(--border);
                      border-radius:var(--radius);padding:12px 14px;display:flex;align-items:flex-start;gap:10px;">
            <span style="font-size:1.3rem;flex-shrink:0;margin-top:1px;">${icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="font-size:0.75rem;font-weight:700;color:var(--muted);">${i + 1}</span>
                <span style="font-size:0.7rem;font-weight:700;background:var(--accent);
                             color:#fff;padding:1px 7px;border-radius:20px;text-transform:uppercase;
                             letter-spacing:.5px;">${type}</span>
              </div>
              <div style="font-size:0.88rem;font-weight:600;line-height:1.3;">
                ${escHtmlHeyGen(s.title || 'Untitled')}
              </div>
              <div style="font-size:0.77rem;color:var(--muted);margin-top:3px;">
                ~${s.duration_seconds || 30}s
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function escHtmlHeyGen(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function updateScriptMeta(container, cleaned) {
  const words   = cleaned.trim() ? cleaned.trim().split(/\s+/).length : 0;
  const minLow  = Math.floor(words / 150);
  const minHigh = Math.ceil(words / 120);
  const metaEl  = container.querySelector('#hg-script-meta');
  if (metaEl) {
    metaEl.textContent = words
      ? `${words.toLocaleString()} words · Est. ${minLow}–${minHigh} min video`
      : '';
  }
}

function setFile(container, file) {
  if (container._fileObjUrl) URL.revokeObjectURL(container._fileObjUrl);
  container._fileObj    = file;
  container._fileObjUrl = URL.createObjectURL(file);

  container.querySelector('#hg-fname').textContent = file.name;
  container.querySelector('#hg-fsize').textContent = formatBytes(file.size);
  container.querySelector('#hg-file-info').style.display = 'block';
  container.querySelector('#hg-drop-zone').style.display  = 'none';
}

function clearFile(container) {
  if (container._fileObjUrl) URL.revokeObjectURL(container._fileObjUrl);
  container._fileObj    = null;
  container._fileObjUrl = '';
  container.querySelector('#hg-file-input').value = '';
  container.querySelector('#hg-file-info').style.display = 'none';
  container.querySelector('#hg-drop-zone').style.display  = '';
  container.querySelector('#hg-render-card').style.display = 'none';
}

function fireVideoComplete(container, videoUrl) {
  document.dispatchEvent(new CustomEvent('video-complete', {
    detail: {
      videoUrl,
      videoId:  container._videoId,
      script:   container._rawScript,
      topic:    container._topic,
    },
  }));
}

function prepareRenderFiles(container) {
  const script  = container.querySelector('#hg-script').value.trim();
  const topic   = container._topic || '';
  const file    = container._fileObj;

  // render-input.json  (heygen_local_file — user places the MP4 in project dir)
  const renderInput = {
    topic,
    script,
    heygen_local_file: file ? file.name : 'heygen-input.mp4',
    heygen_video_url:  '',
    output_filename:   'final-video.mp4',
  };
  triggerDownload(JSON.stringify(renderInput, null, 2), 'render-input.json', 'application/json');

  // .env with Anthropic key
  const { claudeApiKey } = getSettings();
  if (claudeApiKey) {
    triggerDownload(`ANTHROPIC_API_KEY=${claudeApiKey}\n`, '.env', 'text/plain');
  }
}

function animateRenderSteps(container) {
  // Cosmetic step animation that indicates what render.js will do
  const durations = [2000, 3500, 5000, 3000, 500]; // ms per step
  const steps = container.querySelectorAll('.render-step');

  let delay = 400;
  steps.forEach((step, i) => {
    const icon = step.querySelector('.step-icon');
    // Mark as active
    setTimeout(() => {
      icon.textContent = '◐';
      icon.className = 'step-icon active';
    }, delay);
    delay += durations[i];
    // Mark as done
    setTimeout(() => {
      icon.textContent = '✓';
      icon.className = 'step-icon done';
    }, delay);
    delay += 200;
  });
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
