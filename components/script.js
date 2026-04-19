/**
 * Script Generator Component — Step 2
 * Credentials are read from Settings tab via getSettings().
 */

import { getSettings }        from './settings.js';
import { cleanScript }        from './clean-script.js';
import { trackUsage, fmtCost } from './usage.js';

const TONES   = ['Engaging & Energetic', 'Educational & Calm', 'Humorous & Casual', 'Inspirational', 'Documentary-Style'];
const LENGTHS = ['Short (3–5 min)', 'Medium (8–12 min)', 'Long (18–25 min)', 'Extended (25–30 min)'];
const STYLES  = ['Entertainment', 'Tutorial / How-To', 'Opinion / Commentary', 'News / Explainer', 'Storytime / Narrative'];

// Fix 5: increased limits to accommodate web-search token overhead
const TOKEN_MAP = {
  'Short (3–5 min)':      3000,
  'Medium (8–12 min)':    5000,
  'Long (18–25 min)':     7000,
  'Extended (25–30 min)': 9000,
};

const WPM         = 150;   // speaking pace for reading-time estimate
const MAX_HISTORY = 5;

// ── Word count helpers ────────────────────────────────────────────────────────

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function readingTime(words) {
  const mins = Math.round(words / WPM);
  return mins < 1 ? '<1 min' : `~${mins} min`;
}

// ── localStorage persistence ──────────────────────────────────────────────────

function persistScript(container) {
  const wc = wordCount(container._script);
  try {
    localStorage.setItem('pipeline_current_script',    container._script);
    localStorage.setItem('pipeline_current_topic',     container._topic || '');
    localStorage.setItem('pipeline_current_wordcount', String(wc));
    localStorage.setItem('pipeline_current_sources',   container._sources || '');
  } catch {}
}

// ── Central script updater ────────────────────────────────────────────────────

function setScript(container, newScript, { pushHistory = true } = {}) {
  if (pushHistory && container._script) {
    container._history.push(container._script);
    if (container._history.length > MAX_HISTORY) container._history.shift();
  }

  container._script = newScript;
  container._showingCleaned = false;

  // Reset preview toggle state
  const toggleBtn       = container.querySelector('#toggle-preview-btn');
  const actionToggleBtn = container.querySelector('#preview-cleaned-btn');
  const viewLabel       = container.querySelector('#script-view-label');
  if (toggleBtn)       { toggleBtn.textContent = 'Preview (cleaned)'; }
  if (actionToggleBtn) { actionToggleBtn.textContent = '👁 Preview cleaned'; actionToggleBtn.style.borderColor = ''; actionToggleBtn.style.color = ''; }
  if (viewLabel)       { viewLabel.textContent = 'Showing raw script — click "Preview (cleaned)" to see what HeyGen will speak'; viewLabel.style.color = ''; }

  // Update text display
  const textEl = container.querySelector('#script-text');
  if (textEl) textEl.textContent = newScript;

  // Update toolbar word count + undo
  updateToolbar(container);

  // Persist to localStorage
  persistScript(container);

  // Show the output card
  const outCard = container.querySelector('#script-output-card');
  if (outCard) outCard.style.display = 'block';
}

function updateToolbar(container) {
  const wc      = wordCount(container._script);
  const wcEl    = container.querySelector('#script-wordcount');
  const undoBtn = container.querySelector('#undo-btn');
  if (wcEl)    wcEl.textContent = `~${wc.toLocaleString()} words · ${readingTime(wc)} video`;
  if (undoBtn) {
    const count = container._history.length;
    undoBtn.disabled   = count === 0;
    undoBtn.textContent = count > 0 ? `← Undo (${count})` : '← Undo';
  }
}

// ── Toast notification ────────────────────────────────────────────────────────

function showToast(container, msg) {
  // Remove any existing toast
  container.querySelector('.script-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'script-toast';
  toast.textContent = msg;
  container.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderScript(container) {
  container.innerHTML = `
    <style>
      .aud-pill.active   { background: var(--accent) !important; color: #fff !important; border-color: var(--accent) !important; }
      .depth-pill.active { background: var(--accent) !important; color: #fff !important; border-color: var(--accent) !important; }
    </style>
    <div class="card">
      <h2>Script Generator</h2>

      <div class="form-group">
        <label for="script-topic">Topic</label>
        <input type="text" id="script-topic" placeholder="Pick from Trending Topics or type your own…" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="script-tone">Tone</label>
          <select id="script-tone">
            ${TONES.map(t => `<option>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="script-length">Video Length</label>
          <select id="script-length">
            ${LENGTHS.map(l => `<option>${l}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="script-style">Channel Style</label>
          <select id="script-style">
            ${STYLES.map(s => `<option>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="script-channel">Channel Name (optional)</label>
          <input type="text" id="script-channel" placeholder="e.g. TechWithAlex" />
        </div>
      </div>

      <!-- Target Audience -->
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:0.85rem;font-weight:600;color:var(--text);margin-bottom:6px;">
          Target Audience
        </label>
        <div id="audiencePills" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          ${[
            ['🌱','complete beginners'],
            ['👨‍💻','junior developers'],
            ['⚙️','mid-level engineers'],
            ['🏆','senior engineers'],
            ['📊','engineering managers'],
            ['💼','business professionals'],
            ['🚀','startup founders'],
            ['🎓','students'],
          ].map(([icon, val]) =>
            `<button class="aud-pill" data-value="${val}" style="padding:6px 14px;border-radius:20px;
              border:1px solid var(--border);background:var(--surface2);color:var(--muted);
              font-size:13px;cursor:pointer;transition:all .15s;">
              ${icon} ${val.replace(/\b\w/g, c => c.toUpperCase())}
            </button>`
          ).join('')}
        </div>
        <input type="text" id="customAudience"
          placeholder="Or describe your specific audience…"
          style="width:100%;font-size:0.85rem;" />
      </div>

      <!-- Tone Mix sliders -->
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:0.85rem;font-weight:600;color:var(--text);margin-bottom:2px;">
          Tone Mix
        </label>
        <p style="font-size:0.78rem;color:var(--muted);margin-bottom:10px;">
          Adjust the balance of your script's tone
        </p>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${[
            ['technical','🔬 Technical','#185FA5'],
            ['business', '💼 Business', '#6c5ce7'],
            ['casual',   '😄 Casual/Fun','#3B6D11'],
          ].map(([key, label, color]) => `
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:13px;color:var(--muted);width:120px;flex-shrink:0;">${label}</span>
              <input type="range" id="${key}Slider" min="0" max="100"
                style="flex:1;height:4px;accent-color:${color};" />
              <span id="${key}Pct"
                style="font-size:13px;font-weight:600;color:var(--text);width:36px;
                  text-align:right;flex-shrink:0;"></span>
            </div>`
          ).join('')}
          <div style="text-align:right;font-size:12px;color:var(--muted);">
            Total: <span id="toneTotalLabel">100%</span>
          </div>
        </div>
      </div>

      <!-- Expertise Depth -->
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:0.85rem;font-weight:600;color:var(--text);margin-bottom:6px;">
          Technical Depth
        </label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="depthPills">
          ${[
            ['surface','Surface level'],
            ['practical','Practical'],
            ['in-depth','★ In-depth'],
            ['expert','Expert'],
          ].map(([val, lbl]) =>
            `<button class="depth-pill" data-value="${val}"
              style="padding:6px 14px;border-radius:20px;border:1px solid var(--border);
                background:var(--surface2);color:var(--muted);font-size:13px;cursor:pointer;transition:all .15s;">
              ${lbl}
            </button>`
          ).join('')}
        </div>
      </div>

      <!-- Settings summary -->
      <div id="settings-summary"
        style="font-size:0.8rem;color:var(--muted);padding:8px 12px;
          background:var(--surface2);border:1px solid var(--border);
          border-radius:var(--radius);margin-bottom:12px;line-height:1.5;">
      </div>

      <button class="btn btn-primary" id="generate-script-btn">
        <span>Generate Script</span>
      </button>
      <div id="script-status"></div>
    </div>

    <div id="script-output-card" style="display:none" class="card">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <h2 style="margin:0;">Generated Script</h2>
        <button class="btn btn-secondary" id="toggle-preview-btn"
          style="font-size:0.8rem;padding:5px 14px;">
          Preview (cleaned)
        </button>
      </div>

      <!-- Toolbar -->
      <div id="script-toolbar"
        style="display:flex;justify-content:space-between;align-items:center;
               flex-wrap:wrap;gap:8px;padding:10px 14px;
               background:var(--surface2);border:1px solid var(--border);
               border-radius:var(--radius);margin-bottom:10px;">
        <span id="script-wordcount"
          style="font-size:0.82rem;color:var(--muted);white-space:nowrap;">
          ~0 words · ~0 min video
        </span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-secondary" id="undo-btn"
            style="font-size:0.78rem;padding:4px 10px;" disabled>← Undo</button>
          <button class="btn btn-secondary" id="shorten-btn"
            style="font-size:0.78rem;padding:4px 10px;">✂️ Make Shorter</button>
          <button class="btn btn-secondary" id="longer-btn"
            style="font-size:0.78rem;padding:4px 10px;">📝 Make Longer</button>
          <button class="btn btn-secondary" id="regen-btn"
            style="font-size:0.78rem;padding:4px 10px;">🔄 Regenerate</button>
        </div>
      </div>

      <!-- View label -->
      <div id="script-view-label"
        style="font-size:0.78rem;color:var(--muted);margin-bottom:8px;">
        Showing raw script — click "Preview (cleaned)" to see what HeyGen will speak
      </div>

      <div class="script-output" id="script-text"></div>

      <!-- Sources (shown after web-search generation) -->
      <div id="script-sources-section" style="display:none;margin-top:10px;">
        <button id="sources-toggle-btn" class="btn btn-secondary"
          style="font-size:0.78rem;padding:4px 10px;margin-bottom:6px;">
          📚 Sources used (0)
        </button>
        <div id="script-sources-body" style="display:none;
          background:var(--surface2);border:1px solid var(--border);
          border-radius:var(--radius);padding:12px 16px;
          font-size:0.8rem;color:var(--muted);
          white-space:pre-wrap;max-height:200px;overflow-y:auto;line-height:1.6;">
        </div>
      </div>

      <div class="script-actions">
        <button class="btn btn-secondary" id="copy-script-btn">Copy Script</button>
        <button class="btn btn-secondary" id="copy-cleaned-btn">Copy cleaned (for HeyGen)</button>
        <button class="btn btn-secondary" id="preview-cleaned-btn">👁 Preview cleaned</button>
        <button class="btn btn-secondary" id="send-to-video-btn">Send to Video Tab</button>
      </div>
    </div>
  `;

  // ── State ──────────────────────────────────────────────────────────────────
  container._script         = '';
  container._history        = [];
  container._topic          = '';
  container._sources        = '';
  container._showingCleaned = false;

  // Restore persisted script from previous session
  try {
    const saved       = localStorage.getItem('pipeline_current_script');
    const savedTopic   = localStorage.getItem('pipeline_current_topic');
    const savedSources = localStorage.getItem('pipeline_current_sources');
    if (saved) {
      if (savedTopic) container.querySelector('#script-topic').value = savedTopic;
      container._sources = savedSources || '';
      setScript(container, saved, { pushHistory: false });
      if (savedSources) renderSources(container, savedSources, false);
    }
  } catch {}

  // ── Sources toggle ─────────────────────────────────────────────────────────
  container.querySelector('#sources-toggle-btn').addEventListener('click', () => {
    const body = container.querySelector('#script-sources-body');
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
  });

  // ── Set topic from Topics tab ──────────────────────────────────────────────
  container._setTopic = (topic) => {
    if (topic) {
      container._topic = topic.title || topic;
      container.querySelector('#script-topic').value = container._topic;
    }
  };

  // ── Generate ───────────────────────────────────────────────────────────────
  container.querySelector('#generate-script-btn').addEventListener('click', () => {
    generateScript(container);
  });

  // ── Preview toggle (shared between header btn and action btn) ────────────────
  function applyPreviewToggle() {
    const textEl          = container.querySelector('#script-text');
    const headerToggleBtn = container.querySelector('#toggle-preview-btn');
    const actionToggleBtn = container.querySelector('#preview-cleaned-btn');
    const viewLabel       = container.querySelector('#script-view-label');

    if (container._showingCleaned) {
      textEl.textContent        = cleanScript(container._script);
      headerToggleBtn.textContent = 'Show Raw';
      actionToggleBtn.textContent = '👁 Show original';
      actionToggleBtn.style.borderColor = 'var(--accent)';
      actionToggleBtn.style.color       = 'var(--accent)';
      viewLabel.textContent     = 'Showing cleaned version — this is exactly what HeyGen will speak';
      viewLabel.style.color     = '#7af57a';
    } else {
      textEl.textContent        = container._script;
      headerToggleBtn.textContent = 'Preview (cleaned)';
      actionToggleBtn.textContent = '👁 Preview cleaned';
      actionToggleBtn.style.borderColor = '';
      actionToggleBtn.style.color       = '';
      viewLabel.textContent     = 'Showing raw script — click "Preview (cleaned)" to see what HeyGen will speak';
      viewLabel.style.color     = '';
    }
  }

  container.querySelector('#toggle-preview-btn').addEventListener('click', () => {
    container._showingCleaned = !container._showingCleaned;
    applyPreviewToggle();
  });

  container.querySelector('#preview-cleaned-btn').addEventListener('click', () => {
    container._showingCleaned = !container._showingCleaned;
    applyPreviewToggle();
  });

  // ── Undo ───────────────────────────────────────────────────────────────────
  container.querySelector('#undo-btn').addEventListener('click', () => {
    if (!container._history.length) return;
    const prev = container._history.pop();
    setScript(container, prev, { pushHistory: false });
    showToast(container, '↩️ Restored previous version');
  });

  // ── Make Shorter ───────────────────────────────────────────────────────────
  container.querySelector('#shorten-btn').addEventListener('click', () => {
    adjustScript(container, 'shorten');
  });

  // ── Make Longer ────────────────────────────────────────────────────────────
  container.querySelector('#longer-btn').addEventListener('click', () => {
    adjustScript(container, 'expand');
  });

  // ── Regenerate ─────────────────────────────────────────────────────────────
  container.querySelector('#regen-btn').addEventListener('click', () => {
    generateScript(container);
  });

  // ── Copy Script ────────────────────────────────────────────────────────────
  container.querySelector('#copy-script-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(container._script).then(() => {
      const b = container.querySelector('#copy-script-btn');
      b.textContent = 'Copied!';
      setTimeout(() => { b.textContent = 'Copy Script'; }, 1500);
    });
  });

  // ── Copy Cleaned ───────────────────────────────────────────────────────────
  container.querySelector('#copy-cleaned-btn').addEventListener('click', () => {
    const cleaned = cleanScript(container._script);
    navigator.clipboard.writeText(cleaned).then(() => {
      const b = container.querySelector('#copy-cleaned-btn');
      b.textContent = 'Copied!';
      setTimeout(() => { b.textContent = 'Copy cleaned (for HeyGen)'; }, 1500);
    });
  });

  // ── Send to Video Tab ──────────────────────────────────────────────────────
  container.querySelector('#send-to-video-btn').addEventListener('click', () => {
    const topic = container.querySelector('#script-topic').value.trim();
    document.dispatchEvent(new CustomEvent('send-to-video', {
      detail: { script: container._script, topic },
    }));
  });

  // ── Target Audience pills ──────────────────────────────────────────────────
  container.querySelectorAll('.aud-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.aud-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      container.querySelector('#customAudience').value = '';
      localStorage.setItem('pipeline_target_audience', pill.dataset.value);
      updateSummary(container);
    });
  });

  container.querySelector('#customAudience').addEventListener('input', () => {
    const val = container.querySelector('#customAudience').value.trim();
    if (val) container.querySelectorAll('.aud-pill').forEach(p => p.classList.remove('active'));
    localStorage.setItem('pipeline_target_audience', val ? `custom:${val}` : '');
    updateSummary(container);
  });

  // ── Tone sliders ───────────────────────────────────────────────────────────
  const toneState = {
    technical: parseInt(localStorage.getItem('pipeline_tone_technical') ?? '60'),
    business:  parseInt(localStorage.getItem('pipeline_tone_business')  ?? '25'),
    casual:    parseInt(localStorage.getItem('pipeline_tone_casual')    ?? '15'),
  };

  ['technical', 'business', 'casual'].forEach(key => {
    container.querySelector(`#${key}Slider`).addEventListener('input', e => {
      updateSliders(container, toneState, key, parseInt(e.target.value));
      localStorage.setItem('pipeline_tone_technical', toneState.technical);
      localStorage.setItem('pipeline_tone_business',  toneState.business);
      localStorage.setItem('pipeline_tone_casual',    toneState.casual);
      updateSummary(container);
    });
  });

  // ── Expertise Depth pills ──────────────────────────────────────────────────
  container.querySelectorAll('.depth-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.depth-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      localStorage.setItem('pipeline_expertise_depth', pill.dataset.value);
      updateSummary(container);
    });
  });

  // ── Init: restore saved values ─────────────────────────────────────────────
  {
    const savedAud = localStorage.getItem('pipeline_target_audience') || 'mid-level engineers';
    if (savedAud.startsWith('custom:')) {
      container.querySelector('#customAudience').value = savedAud.slice(7);
    } else {
      const matching = container.querySelector(`.aud-pill[data-value="${savedAud}"]`);
      if (matching) {
        matching.classList.add('active');
      } else {
        const def = container.querySelector('.aud-pill[data-value="mid-level engineers"]');
        if (def) def.classList.add('active');
      }
    }

    applySliderValues(container, toneState);

    const savedDepth = localStorage.getItem('pipeline_expertise_depth') || 'in-depth';
    const depthPill  = container.querySelector(`.depth-pill[data-value="${savedDepth}"]`);
    if (depthPill) depthPill.classList.add('active');
  }

  updateSummary(container);
}

// ── Sources display ───────────────────────────────────────────────────────────

function renderSources(container, sources, expand = false) {
  const section   = container.querySelector('#script-sources-section');
  const body      = container.querySelector('#script-sources-body');
  const toggleBtn = container.querySelector('#sources-toggle-btn');
  if (!section || !sources.trim()) return;

  // Count how many distinct URLs/snippets were returned
  const lines = sources.split('\n').filter(l => l.trim());
  const count  = Math.max(1, lines.length);

  section.style.display   = 'block';
  body.textContent        = sources.trim();
  body.style.display      = expand ? 'block' : 'none';
  toggleBtn.textContent   = `📚 Sources used (${count})`;
}

// ── Generate script (full generation) ────────────────────────────────────────

async function generateScript(container) {
  const topic   = container.querySelector('#script-topic').value.trim();
  const tone    = container.querySelector('#script-tone').value;
  const length  = container.querySelector('#script-length').value;
  const style   = container.querySelector('#script-style').value;
  const channel = container.querySelector('#script-channel').value.trim();
  const { claudeApiKey, geminiApiKey } = getSettings();
  const audience = getTargetAudience(container);
  const toneMix  = getToneMix(container);
  const depth    = getExpertiseDepth(container);

  const statusEl = container.querySelector('#script-status');
  const btn      = container.querySelector('#generate-script-btn');

  if (!topic) {
    statusEl.innerHTML = `<div class="status-bar error">Please enter a topic first.</div>`;
    return;
  }

  container._topic = topic;
  setToolbarBusy(container, true);
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Generating…</span>';
  statusEl.innerHTML = '';

  // Fix 4: research-aware progress messages
  function showProgress(msg) {
    statusEl.innerHTML = `<div class="status-bar info">${msg}</div>`;
  }
  showProgress('🔍 Researching latest 2026 data…');
  const t1 = setTimeout(() => showProgress('📰 Found recent news and statistics…'), 5000);
  const t2 = setTimeout(() => showProgress('✍️ Writing your script with fresh data…'), 10000);

  try {
    let script, sources = '';
    if (claudeApiKey || geminiApiKey) {
      let provider;
      ({ script, sources, provider } = await generateWithClaude({ topic, tone, length, style, channel, statusEl, audience, toneMix, depth }));
      if (provider) showProviderBadge(container, provider);
    } else {
      script = generateTemplate({ topic, tone, length, style, channel });
      clearTimeout(t1); clearTimeout(t2);
      statusEl.innerHTML = `<div class="status-bar info">Template mode — add a Claude or Gemini API key in <strong>⚙ Settings</strong> for AI-generated scripts.</div>`;
    }

    clearTimeout(t1); clearTimeout(t2);
    showProgress('✅ Script complete with latest 2026 insights!');
    setTimeout(() => { statusEl.innerHTML = ''; }, 2500);

    container._sources = sources;
    const prevWC = wordCount(container._script);
    setScript(container, script);
    if (sources) renderSources(container, sources, false);
    const newWC = wordCount(script);
    if (prevWC > 0) {
      const diff = newWC - prevWC;
      showToast(container, diff >= 0
        ? `🔄 Regenerated · +${diff.toLocaleString()} words`
        : `🔄 Regenerated · ${diff.toLocaleString()} words`);
    }
  } catch (err) {
    clearTimeout(t1); clearTimeout(t2);
    // Fix 3: detailed error with console hint
    statusEl.innerHTML = `<div class="status-bar error">
      <strong>Script generation failed:</strong><br>
      ${escHtml(err.message)}<br>
      <small style="opacity:0.7;">Check browser console (F12) for full debug info</small>
    </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Generate Script</span>';
    setToolbarBusy(container, false);
  }
}

// ── Adjust script (shorten / expand) ─────────────────────────────────────────

async function adjustScript(container, mode) {
  if (!container._script) return;
  const { claudeApiKey, geminiApiKey } = getSettings();
  if (!claudeApiKey && !geminiApiKey) {
    showToast(container, '⚠️ Add a Claude or Gemini API key in Settings first');
    return;
  }

  const statusEl   = container.querySelector('#script-status');
  const isShorten  = mode === 'shorten';
  const loadingMsg = isShorten ? '✂️ Shortening script…' : '📝 Expanding script…';

  setToolbarBusy(container, true);
  statusEl.innerHTML = `<div class="status-bar info">${loadingMsg}</div>`;

  const systemPrompt = isShorten
    ? `You are a video script editor. Shorten the provided script by 30% while keeping:
- The opening hook intact
- All main section headings
- The closing CTA and subscribe/like request
- The most important points in each section

Remove:
- Repetitive explanations
- Excessive examples (keep best one per section)
- Overly long transitions
- Padding and filler phrases

Return ONLY the shortened script, no commentary.`
    : `You are a video script editor. Expand the provided script by 30% while:
- Adding more depth and examples to each main section
- Including relevant statistics or data points
- Adding smoother transitions between sections
- Expanding the introduction to build more context
- Adding a 'common mistakes' or 'pro tips' subsection
- Keeping the same tone and style throughout
- Keeping the opening hook and closing CTA intact

Return ONLY the expanded script, no commentary.`;

  const userMsg = isShorten
    ? `Shorten this script:\n\n${container._script}`
    : `Expand this script:\n\n${container._script}`;

  try {
    let newScript;
    const action = isShorten ? 'script_shorten' : 'script_expand';

    // Try via window.callAI (handles Gemini fallback automatically)
    if (typeof window.callAI === 'function') {
      const result = await window.callAI({
        prompt:       userMsg,
        systemPrompt,
        maxTokens:    isShorten ? 4000 : 8000,
        action,
      });
      newScript = result.text;
      trackUsage(action, result.inputTokens || 0, result.outputTokens || 0);
    } else {
      // Direct call (ai-client.js not loaded)
      const res = await fetchWithRetry(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-opus-4-5',
            max_tokens: isShorten ? 4000 : 8000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMsg }],
          }),
        },
        statusEl
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 429) throw new Error('Rate limit hit — please wait 30 seconds and try again.');
        throw new Error(`Claude API error: ${err?.error?.message || res.statusText}`);
      }
      const data = await res.json();
      newScript = data.content?.[0]?.text || '';
      trackUsage(action, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
    }

    if (!newScript) throw new Error('Empty response from AI.');

    const prevWC = wordCount(container._script);
    setScript(container, newScript);
    const newWC  = wordCount(newScript);
    const diff   = newWC - prevWC;
    const sign   = diff >= 0 ? '+' : '';
    const label  = isShorten ? '✂️ Script shortened' : '📝 Script expanded';
    showToast(container, `${label} · ${sign}${diff.toLocaleString()} words`);
    statusEl.innerHTML = '';

  } catch (err) {
    statusEl.innerHTML = `<div class="status-bar error">${escHtml(err.message)}</div>`;
  } finally {
    setToolbarBusy(container, false);
  }
}

// Disable/enable all toolbar buttons during async operations
function setToolbarBusy(container, busy) {
  ['shorten-btn', 'longer-btn', 'regen-btn', 'undo-btn'].forEach(id => {
    const el = container.querySelector(`#${id}`);
    if (!el) return;
    if (busy) {
      el.disabled = true;
    } else {
      // undo only re-enables if history exists
      if (id === 'undo-btn') {
        el.disabled = container._history.length === 0;
      } else {
        el.disabled = false;
      }
    }
  });
}

// ── Claude full-script generation with continuation ───────────────────────────

// Fix 1: parse ALL text blocks and join them (Claude splits long responses)
// ── Provider badge ────────────────────────────────────────────────────────────

function showProviderBadge(container, provider) {
  container.querySelector('#script-provider-badge')?.remove();
  const badge = document.createElement('span');
  badge.id = 'script-provider-badge';
  badge.style.cssText = 'font-size:0.75rem;padding:2px 8px;border-radius:10px;' +
    (provider === 'gemini'
      ? 'background:rgba(26,115,232,.15);color:#4a8af4;border:1px solid rgba(26,115,232,.25);'
      : 'background:rgba(255,154,0,.12);color:#d97706;border:1px solid rgba(255,154,0,.25);');
  badge.textContent = provider === 'gemini' ? '⚡ Gemini Flash' : '🤖 Claude';
  const wcEl = container.querySelector('#script-wordcount');
  if (wcEl) wcEl.after(badge);
}

async function generateWithClaude({ topic, tone, length, style, channel, statusEl, audience = 'mid-level engineers', toneMix = { technical: 60, business: 25, casual: 15 }, depth = 'in-depth' }) {
  const channelLine   = channel ? ` Channel: "${channel}".` : '';
  const maxTokens     = TOKEN_MAP[length] ?? 4000;
  const audienceBlock = buildAudiencePrompt(audience, toneMix, depth);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const year  = new Date().getFullYear();
  const systemPrompt = `Today's date is ${today}. You are writing a YouTube script in ${year}. All statistics, data points, and references MUST be from 2025 or ${year} wherever possible. Before writing the script, search the web for the latest news and statistics about the topic so the content reflects the current state of the world. When citing data, use phrases like "As of ${year}…", "According to recent reports…", or "The latest data shows…". Search queries to run before writing: "${topic} latest news ${year}", "${topic} statistics ${year}", "${topic} trends ${year}".`;

  const prompt = `You are a YouTube scriptwriter. Write a ready-to-record ${style} script.${channelLine}
Topic: ${topic} | Tone: ${tone} | Length: ${length}

${audienceBlock}

IMPORTANT: Always complete the full script including the closing CTA and sign-off. Never end mid-sentence or mid-section. If running long, condense earlier sections rather than cutting off the ending.

STRUCTURE (use these labels):
[HOOK] 15-second attention grab — bold question, surprising fact, or provocative statement.
[OPENING] Thank viewers warmly. Natural subscribe ask tied to channel value. Like ask tied to a specific relatable moment about "${topic}".
[SECTION 1] / [SECTION 2] / [SECTION 3] (add more for longer videos) — spoken language, real examples, smooth transitions.
[CLOSING] Must include all: (1) Recap the 3 key insights learned today — feel like payoff not a list. (2) Like ask: "smash that like button". (3) Subscribe + bell with a teased next topic. (4) Specific comment question about "${topic}" that makes people want to answer. (5) Natural sign-off.

Write for the ear. Keep opening/closing human, not templated. Output only the script.`;

  let charEstimate = 0;
  const startTime = Date.now();
  const progressTimer = setInterval(() => {
    charEstimate = Math.round((Date.now() - startTime) / 1000 * 40);
    if (statusEl) {
      statusEl.innerHTML = `<div class="status-bar info">✍️ Writing… (~${charEstimate.toLocaleString()} characters so far)</div>`;
    }
  }, 2000);

  try {
    let result = await window.callAI({
      prompt,
      systemPrompt,
      maxTokens,
      requiresWebSearch: true,
      action: 'script_gen',
    });

    let fullScript = result.text;

    // If web-search result too short, retry without web search
    if (fullScript.length < 500) {
      console.warn(`[script] Web-search result too short (${fullScript.length} chars) — retrying without web search`);
      if (statusEl) statusEl.innerHTML = `<div class="status-bar info">⚠️ Retrying without web search…</div>`;
      result = await window.callAI({
        prompt,
        systemPrompt,
        maxTokens,
        action: 'script_gen',
      });
      fullScript = result.text;
    }

    // Continuation if script was truncated (missing [CLOSING] section)
    if (fullScript.length > 200 && !fullScript.includes('[CLOSING]')) {
      console.log('[script] Script truncated — fetching continuation…');
      if (statusEl) statusEl.innerHTML = `<div class="status-bar info">✍️ Script is long — fetching continuation…</div>`;
      const cont = await window.callAI({
        systemPrompt: `${systemPrompt}\n\nYou were writing a YouTube script and were cut off. Here is what you wrote so far:\n\n${fullScript}\n\nContinue the script from exactly where you left off. Do not repeat any text already written.`,
        prompt: 'Continue the script seamlessly from where you left off. Output only the new continuation text.',
        maxTokens,
        action: 'script_gen',
      });
      fullScript += cont.text.trimStart();
    }

    trackUsage('script_gen', result.inputTokens, result.outputTokens);

    return { script: fullScript, sources: '', provider: result.provider };
  } finally {
    clearInterval(progressTimer);
  }
}

// ── Retry fetch on 429 ────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, statusEl) {
  const delays = [10, 30];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    if (attempt === delays.length) return res;
    const wait = delays[attempt];
    for (let i = wait; i > 0; i--) {
      if (statusEl) {
        statusEl.innerHTML = `<div class="status-bar error">Rate limit hit — retrying in <strong>${i}s</strong>…</div>`;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// ── Template fallback ─────────────────────────────────────────────────────────

function generateTemplate({ topic, tone, length, style, channel }) {
  const ch = channel || 'this channel';

  return `[HOOK]
Hey — before you scroll past, let me ask you something. Have you ever wondered about ${topic}? Because today, we're going deep on exactly that, and what I found might completely change how you think about it.

[OPENING]
What's up everyone, welcome back to ${ch}. Seriously, thank you for clicking on this — ${topic} is something I've wanted to break down for a while, and I'm glad you're here for it.

If you're getting value from content like this, hit subscribe — we put out videos on this stuff every week and I'd love to have you along for the ride.

And hey — hit the like button if you've ever gone down a rabbit hole researching ${topic} and come out more confused than when you started. Because same. Let's fix that today.

[SECTION 1: THE SETUP]
So first, let's talk about the big picture. ${topic} is one of those subjects that sounds simple on the surface, but the more you dig into it, the more nuance you find. Here's what most people get wrong from the start…

[SECTION 2: THE CORE CONTENT]
Now here's where it gets really interesting. Let me walk you through the key things you need to understand.

Point one — context matters enormously here. The way ${topic} works today is completely different from even a couple of years ago.

Point two — most guides skip over the foundational stuff. That's a mistake. We're not going to do that.

Point three — there are a few counterintuitive moves that the people who really get this use. I'll walk you through exactly what those are.

[SECTION 3: PRACTICAL TAKEAWAYS]
Alright, here's how you actually apply this. Whether you're just starting out or you've been in the space for a while, these moves will make a difference.

Step one: start with the fundamentals from section one — they matter more than most people realise.
Step two: apply the framework from section two to your specific situation.
Step three: iterate. Don't wait for perfect conditions.

[CLOSING]
So here's what we covered today. First, we looked at why ${topic} is more nuanced than it looks on the surface — and what most people get wrong. Second, we walked through the core framework you actually need to understand it properly. And third, we turned all of that into practical steps you can actually use.

If you got value from this video, smash that like button — it genuinely helps more people find this content and keeps this channel growing.

And if you haven't already, subscribe and hit the notification bell — our next video is going to cover something that builds directly on what we talked about today, and you don't want to miss it.

Drop a comment below — I want to know: what's the one thing about ${topic} that took you the longest to actually understand? I read every comment and I genuinely want to hear your experience.

See you in the next one!`;
}

// ── Audience / Tone / Depth helpers ──────────────────────────────────────────

function updateSliders(container, toneState, changed, newValue) {
  const others      = ['technical', 'business', 'casual'].filter(k => k !== changed);
  const oldOtherSum = others.reduce((s, k) => s + toneState[k], 0);
  const diff        = toneState[changed] - newValue;
  toneState[changed] = newValue;

  if (oldOtherSum === 0) {
    const share = Math.floor(diff / others.length);
    others.forEach(k => { toneState[k] = Math.max(0, toneState[k] + share); });
  } else {
    others.forEach(k => {
      toneState[k] = Math.round(toneState[k] + diff * (toneState[k] / oldOtherSum));
      toneState[k] = Math.max(0, toneState[k]);
    });
  }

  // Ensure total = 100
  const total = Object.values(toneState).reduce((s, v) => s + v, 0);
  if (total !== 100) toneState[others[0]] = Math.max(0, toneState[others[0]] + (100 - total));

  applySliderValues(container, toneState);
}

function applySliderValues(container, toneState) {
  const total = Object.values(toneState).reduce((s, v) => s + v, 0);
  ['technical', 'business', 'casual'].forEach(key => {
    const slider = container.querySelector(`#${key}Slider`);
    const pct    = container.querySelector(`#${key}Pct`);
    if (slider) slider.value = toneState[key];
    if (pct)    pct.textContent = `${toneState[key]}%`;
  });
  const totalLabel = container.querySelector('#toneTotalLabel');
  if (totalLabel) {
    totalLabel.textContent = `${total}%`;
    totalLabel.style.color = total === 100 ? 'var(--muted)' : '#f57a7a';
  }
}

function getTargetAudience(container) {
  const custom = container.querySelector('#customAudience')?.value.trim();
  if (custom) return custom;
  const active = container.querySelector('.aud-pill.active');
  return active ? active.dataset.value : 'general audience';
}

function getToneMix(container) {
  return {
    technical: parseInt(container.querySelector('#technicalSlider')?.value || '60'),
    business:  parseInt(container.querySelector('#businessSlider')?.value  || '25'),
    casual:    parseInt(container.querySelector('#casualSlider')?.value    || '15'),
  };
}

function getExpertiseDepth(container) {
  const active = container.querySelector('.depth-pill.active');
  return active ? active.dataset.value : 'in-depth';
}

function updateSummary(container) {
  const audience  = getTargetAudience(container);
  const tone      = getToneMix(container);
  const depth     = getExpertiseDepth(container);
  const summaryEl = container.querySelector('#settings-summary');
  if (!summaryEl) return;
  summaryEl.innerHTML = `
    <strong>Audience:</strong> ${escHtml(audience)} &nbsp;·&nbsp;
    <strong>Tone:</strong> ${tone.technical}% technical / ${tone.business}% business / ${tone.casual}% casual &nbsp;·&nbsp;
    <strong>Depth:</strong> ${depth}
  `;
}

function getAudienceInstructions(audience) {
  const map = {
    'complete beginners':    'Use analogies and simple language. Define all technical terms. Build concepts from scratch.',
    'junior developers':     'Assume basic programming knowledge. Explain patterns and best practices. Encourage experimentation.',
    'mid-level engineers':   'Assume solid technical foundation. Focus on trade-offs, patterns, and real-world scenarios.',
    'senior engineers':      'Assume deep expertise. Focus on architecture, system design, and nuanced trade-offs.',
    'engineering managers':  'Balance technical accuracy with business impact. Highlight team and process implications.',
    'business professionals':'Minimise jargon. Emphasise ROI, competitive advantage, and strategic implications.',
    'startup founders':      'Focus on speed, pragmatism, and leverage. What matters most with limited resources.',
    'students':              'Explain concepts clearly. Connect theory to practice. Encourage curiosity.',
  };
  return map[audience] ? `AUDIENCE GUIDANCE: ${map[audience]}` : '';
}

function buildAudiencePrompt(audience, toneMix, depth) {
  const toneDesc = [];
  if (toneMix.technical >= 40) toneDesc.push('technically detailed');
  if (toneMix.business  >= 30) toneDesc.push('business-focused');
  if (toneMix.casual    >= 30) toneDesc.push('casual and conversational');
  const toneStr = toneDesc.length ? toneDesc.join(', ') : 'balanced';

  const depthMap = {
    'surface':   'Keep explanations high-level and accessible. Avoid jargon. Focus on big picture concepts.',
    'practical': 'Include practical examples and actionable steps. Some technical detail where useful.',
    'in-depth':  'Go deep on the subject. Include technical nuance, examples, and edge cases.',
    'expert':    'Assume significant prior knowledge. Use precise technical language. Explore advanced concepts and trade-offs.',
  };

  return [
    `TARGET AUDIENCE: ${audience}`,
    `TONE MIX: ${toneMix.technical}% technical / ${toneMix.business}% business / ${toneMix.casual}% casual — write in a ${toneStr} voice.`,
    `TECHNICAL DEPTH: ${depth} — ${depthMap[depth] || depthMap['in-depth']}`,
    getAudienceInstructions(audience),
  ].filter(Boolean).join('\n');
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
