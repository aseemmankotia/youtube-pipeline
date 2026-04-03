/**
 * Script Generator Component — Step 2
 * Credentials are read from Settings tab via getSettings().
 */

import { getSettings } from './settings.js';
import { cleanScript } from './clean-script.js';

const TONES   = ['Engaging & Energetic', 'Educational & Calm', 'Humorous & Casual', 'Inspirational', 'Documentary-Style'];
const LENGTHS = ['Short (3–5 min)', 'Medium (8–12 min)', 'Long (18–25 min)'];
const STYLES  = ['Entertainment', 'Tutorial / How-To', 'Opinion / Commentary', 'News / Explainer', 'Storytime / Narrative'];

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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <h2 style="margin:0;">Generated Script</h2>
        <button class="btn btn-secondary" id="toggle-preview-btn"
          style="font-size:0.8rem;padding:5px 14px;">
          Preview (cleaned)
        </button>
      </div>
      <div id="script-view-label"
        style="font-size:0.78rem;color:var(--muted);margin-bottom:8px;">
        Showing raw script — click "Preview (cleaned)" to see what HeyGen will speak
      </div>
      <div class="script-output" id="script-text"></div>
      <div class="script-actions">
        <button class="btn btn-secondary" id="copy-script-btn">Copy Script</button>
        <button class="btn btn-secondary" id="send-to-video-btn">Send to Video Tab</button>
      </div>
    </div>
  `;

  container._setTopic = (topic) => {
    if (topic) container.querySelector('#script-topic').value = topic.title || topic;
  };

  container.querySelector('#generate-script-btn').addEventListener('click', () => {
    generateScript(container);
  });
}

async function generateScript(container) {
  const topic   = container.querySelector('#script-topic').value.trim();
  const tone    = container.querySelector('#script-tone').value;
  const length  = container.querySelector('#script-length').value;
  const style   = container.querySelector('#script-style').value;
  const channel = container.querySelector('#script-channel').value.trim();
  const { claudeApiKey: apiKey } = getSettings();

  const statusEl = container.querySelector('#script-status');
  const outCard  = container.querySelector('#script-output-card');
  const textEl   = container.querySelector('#script-text');
  const btn      = container.querySelector('#generate-script-btn');

  if (!topic) {
    statusEl.innerHTML = `<div class="status-bar error">Please enter a topic first.</div>`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Generating…</span>';
  statusEl.innerHTML = '';
  outCard.style.display = 'none';

  try {
    let script;
    if (apiKey) {
      script = await generateWithClaude({ topic, tone, length, style, channel, apiKey, statusEl });
    } else {
      script = generateTemplate({ topic, tone, length, style, channel });
      statusEl.innerHTML = `
        <div class="status-bar info">
          Template mode — add a Claude API key in <strong>⚙ Settings</strong> for AI-generated scripts.
        </div>`;
    }

    textEl.textContent = script;
    outCard.style.display = 'block';

    // Preview toggle — raw vs cleaned
    let showingCleaned = false;
    const toggleBtn  = container.querySelector('#toggle-preview-btn');
    const viewLabel  = container.querySelector('#script-view-label');
    toggleBtn.onclick = () => {
      showingCleaned = !showingCleaned;
      if (showingCleaned) {
        textEl.textContent = cleanScript(script);
        toggleBtn.textContent = 'Show Raw';
        viewLabel.textContent = 'Showing cleaned script — this is what HeyGen will speak';
      } else {
        textEl.textContent = script;
        toggleBtn.textContent = 'Preview (cleaned)';
        viewLabel.textContent = 'Showing raw script — click "Preview (cleaned)" to see what HeyGen will speak';
      }
    };

    container.querySelector('#copy-script-btn').onclick = () => {
      navigator.clipboard.writeText(script).then(() => {
        const b = container.querySelector('#copy-script-btn');
        b.textContent = 'Copied!';
        setTimeout(() => b.textContent = 'Copy Script', 1500);
      });
    };

    container.querySelector('#send-to-video-btn').onclick = () => {
      const topic = container.querySelector('#script-topic').value.trim();
      document.dispatchEvent(new CustomEvent('send-to-video', { detail: { script, topic } }));
    };

  } catch (err) {
    statusEl.innerHTML = `<div class="status-bar error">${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Generate Script</span>';
  }
}

// Retry fetch on 429 with exponential backoff (10s → 30s).
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

async function generateWithClaude({ topic, tone, length, style, channel, apiKey, statusEl }) {
  const channelLine = channel ? ` Channel: "${channel}".` : '';

  // Scale max_tokens to video length to avoid hitting rate limits on short videos
  const maxTokens = length.includes('18') || length.includes('25') ? 3000 : 2000;

  const prompt = `You are a YouTube scriptwriter. Write a ready-to-record ${style} script.${channelLine}
Topic: ${topic} | Tone: ${tone} | Length: ${length}

STRUCTURE (use these labels):
[HOOK] 15-second attention grab — bold question, surprising fact, or provocative statement.
[OPENING] Thank viewers warmly. Natural subscribe ask tied to channel value. Like ask tied to a specific relatable moment about "${topic}".
[SECTION 1] / [SECTION 2] / [SECTION 3] (add more for longer videos) — spoken language, real examples, smooth transitions.
[CLOSING] Must include all: (1) Recap the 3 key insights learned today — feel like payoff not a list. (2) Like ask: "smash that like button". (3) Subscribe + bell with a teased next topic. (4) Specific comment question about "${topic}" that makes people want to answer. (5) Natural sign-off.

Write for the ear. Keep opening/closing human, not templated. Output only the script.`;

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
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
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
  return data.content?.[0]?.text || '';
}

function generateTemplate({ topic, tone, length, style, channel }) {
  const ch = channel || 'this channel';
  const mins = length.match(/\d+/g);
  const minStr = mins ? `${mins[0]}–${mins[1]} minutes` : 'a few minutes';

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
