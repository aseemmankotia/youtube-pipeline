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

const TOKEN_MAP = {
  'Short (3–5 min)':      2000,
  'Medium (8–12 min)':    4000,
  'Long (18–25 min)':     6000,
  'Extended (25–30 min)': 8000,
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

      <div class="script-actions">
        <button class="btn btn-secondary" id="copy-script-btn">Copy Script</button>
        <button class="btn btn-secondary" id="copy-cleaned-btn">Copy cleaned (for HeyGen)</button>
        <button class="btn btn-secondary" id="preview-cleaned-btn">👁 Preview cleaned</button>
        <button class="btn btn-secondary" id="send-to-video-btn">Send to Video Tab</button>
      </div>
    </div>
  `;

  // ── State ──────────────────────────────────────────────────────────────────
  container._script       = '';
  container._history      = [];
  container._topic        = '';
  container._showingCleaned = false;

  // Restore persisted script from previous session
  try {
    const saved = localStorage.getItem('pipeline_current_script');
    const savedTopic = localStorage.getItem('pipeline_current_topic');
    if (saved) {
      if (savedTopic) container.querySelector('#script-topic').value = savedTopic;
      setScript(container, saved, { pushHistory: false });
    }
  } catch {}

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
}

// ── Generate script (full generation) ────────────────────────────────────────

async function generateScript(container) {
  const topic   = container.querySelector('#script-topic').value.trim();
  const tone    = container.querySelector('#script-tone').value;
  const length  = container.querySelector('#script-length').value;
  const style   = container.querySelector('#script-style').value;
  const channel = container.querySelector('#script-channel').value.trim();
  const { claudeApiKey: apiKey } = getSettings();

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

  // Progress messages on timer
  function showProgress(msg) {
    statusEl.innerHTML = `<div class="status-bar info">${msg}</div>`;
  }
  showProgress('✍️ Writing intro and hook…');
  const t1 = setTimeout(() => showProgress('✍️ Developing main sections…'), 3000);
  const t2 = setTimeout(() => showProgress('✍️ Writing conclusion and CTA…'), 6000);

  try {
    let script;
    if (apiKey) {
      script = await generateWithClaude({ topic, tone, length, style, channel, apiKey, statusEl });
    } else {
      script = generateTemplate({ topic, tone, length, style, channel });
      clearTimeout(t1); clearTimeout(t2);
      statusEl.innerHTML = `<div class="status-bar info">Template mode — add a Claude API key in <strong>⚙ Settings</strong> for AI-generated scripts.</div>`;
    }

    clearTimeout(t1); clearTimeout(t2);
    showProgress('✅ Script complete!');
    setTimeout(() => { statusEl.innerHTML = ''; }, 2000);

    const prevWC = wordCount(container._script);
    setScript(container, script);
    const newWC = wordCount(script);
    if (prevWC > 0) {
      const diff = newWC - prevWC;
      showToast(container, diff >= 0
        ? `🔄 Regenerated · +${diff.toLocaleString()} words`
        : `🔄 Regenerated · ${diff.toLocaleString()} words`);
    }
  } catch (err) {
    clearTimeout(t1); clearTimeout(t2);
    statusEl.innerHTML = `<div class="status-bar error">${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Generate Script</span>';
    setToolbarBusy(container, false);
  }
}

// ── Adjust script (shorten / expand) ─────────────────────────────────────────

async function adjustScript(container, mode) {
  if (!container._script) return;
  const { claudeApiKey: apiKey } = getSettings();
  if (!apiKey) {
    showToast(container, '⚠️ Add a Claude API key in Settings first');
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

    const data      = await res.json();
    const newScript = data.content?.[0]?.text || '';
    if (!newScript) throw new Error('Empty response from Claude.');

    trackUsage(
      isShorten ? 'script_shorten' : 'script_expand',
      data.usage?.input_tokens  || 0,
      data.usage?.output_tokens || 0
    );

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

async function generateWithClaude({ topic, tone, length, style, channel, apiKey, statusEl }) {
  const channelLine = channel ? ` Channel: "${channel}".` : '';
  const maxTokens   = TOKEN_MAP[length] ?? 4000;

  const prompt = `You are a YouTube scriptwriter. Write a ready-to-record ${style} script.${channelLine}
Topic: ${topic} | Tone: ${tone} | Length: ${length}

IMPORTANT: Always complete the full script including the closing CTA and sign-off. Never end mid-sentence or mid-section. If running long, condense earlier sections rather than cutting off the ending.

STRUCTURE (use these labels):
[HOOK] 15-second attention grab — bold question, surprising fact, or provocative statement.
[OPENING] Thank viewers warmly. Natural subscribe ask tied to channel value. Like ask tied to a specific relatable moment about "${topic}".
[SECTION 1] / [SECTION 2] / [SECTION 3] (add more for longer videos) — spoken language, real examples, smooth transitions.
[CLOSING] Must include all: (1) Recap the 3 key insights learned today — feel like payoff not a list. (2) Like ask: "smash that like button". (3) Subscribe + bell with a teased next topic. (4) Specific comment question about "${topic}" that makes people want to answer. (5) Natural sign-off.

Write for the ear. Keep opening/closing human, not templated. Output only the script.`;

  let fullScript = '';
  let messages   = [{ role: 'user', content: prompt }];
  const MAX_CONTINUATIONS = 2;

  for (let pass = 0; pass <= MAX_CONTINUATIONS; pass++) {
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
        body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: maxTokens, messages }),
      },
      pass === 0 ? statusEl : null
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error('Rate limit hit — please wait 30 seconds and try again.');
      throw new Error(`Claude API error: ${err?.error?.message || res.statusText}`);
    }

    const data       = await res.json();
    const chunk      = data.content?.[0]?.text || '';
    const stopReason = data.stop_reason;

    // Track token usage for this pass
    trackUsage('script_gen',
      data.usage?.input_tokens  || 0,
      data.usage?.output_tokens || 0,
      { topic, pass });

    fullScript += (pass === 0 ? chunk : chunk.trimStart());

    if (stopReason !== 'max_tokens') break;

    if (pass === MAX_CONTINUATIONS) {
      console.warn('[script] Script truncated after max continuations');
      if (statusEl) {
        statusEl.innerHTML = `<div class="status-bar error">⚠️ Script was cut off due to length limits. Try selecting a shorter video length.</div>`;
        setTimeout(() => { statusEl.innerHTML = ''; }, 6000);
      }
      break;
    }

    console.log(`[script] Truncated at pass ${pass} — requesting continuation…`);
    if (statusEl) {
      statusEl.innerHTML = `<div class="status-bar info">✍️ Script is long — fetching continuation (${pass + 1}/${MAX_CONTINUATIONS})…</div>`;
    }
    messages = [
      { role: 'user',      content: prompt },
      { role: 'assistant', content: fullScript },
      { role: 'user',      content: 'Please continue the script from where you left off. Do not repeat anything already written. Continue seamlessly.' },
    ];
  }

  return fullScript;
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

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
