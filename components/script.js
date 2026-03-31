/**
 * Script Generator Component
 * Generates a full YouTube video script via the Claude (Anthropic) API
 * or falls back to a local template-based generator when no API key is set.
 */

const TONES = ['Engaging & Energetic', 'Educational & Calm', 'Humorous & Casual', 'Inspirational', 'Documentary-Style'];
const LENGTHS = ['Short (3–5 min)', 'Medium (8–12 min)', 'Long (18–25 min)'];
const STYLES = ['Entertainment', 'Tutorial / How-To', 'Opinion / Commentary', 'News / Explainer', 'Storytime / Narrative'];

export function renderScript(container, getSelectedTopic) {
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

      <div class="form-group">
        <label for="claude-key">
          Claude API Key
          <span style="color:var(--muted);font-weight:400"> — leave blank to use template mode</span>
        </label>
        <input type="password" id="claude-key" placeholder="sk-ant-…" autocomplete="off" />
      </div>

      <button class="btn btn-primary" id="generate-script-btn">
        <span>Generate Script</span>
      </button>
      <div id="script-status"></div>
    </div>

    <div id="script-output-card" style="display:none" class="card">
      <h2>Generated Script</h2>
      <div class="script-output" id="script-text"></div>
      <div class="script-actions">
        <button class="btn btn-secondary" id="copy-script-btn">Copy Script</button>
        <button class="btn btn-secondary" id="send-to-video-btn">Send to Video Tab</button>
      </div>
    </div>
  `;

  // Auto-fill topic when one is selected from the Topics tab
  const topicInput = container.querySelector('#script-topic');
  // Expose a setter for app.js to call
  container._setTopic = (topic) => {
    if (topic) topicInput.value = topic.title || topic;
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
  const apiKey  = container.querySelector('#claude-key').value.trim();

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
      script = await generateWithClaude({ topic, tone, length, style, channel, apiKey });
    } else {
      script = generateTemplate({ topic, tone, length, style, channel });
      statusEl.innerHTML = `
        <div class="status-bar info">
          Template mode — add a Claude API key above for AI-generated scripts.
        </div>`;
    }

    textEl.textContent = script;
    outCard.style.display = 'block';

    // Wire copy button
    container.querySelector('#copy-script-btn').onclick = () => {
      navigator.clipboard.writeText(script).then(() => {
        const b = container.querySelector('#copy-script-btn');
        b.textContent = 'Copied!';
        setTimeout(() => b.textContent = 'Copy Script', 1500);
      });
    };

    // Wire "send to video" button — dispatches a custom event
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

async function generateWithClaude({ topic, tone, length, style, channel, apiKey }) {
  const channelLine = channel ? ` The channel is called "${channel}".` : '';
  const prompt = `You are a professional YouTube scriptwriter.
Write a complete, ready-to-record YouTube script for a ${style} video.${channelLine}

Topic: ${topic}
Tone: ${tone}
Target video length: ${length}

Structure the script with clearly labelled sections:
[HOOK], [INTRO], [SECTION 1], [SECTION 2], [SECTION 3], [CTA], [OUTRO]

Include:
- An attention-grabbing hook (first 15 seconds)
- Natural spoken language with pacing notes where helpful
- Smooth transitions between sections
- A clear call-to-action
- Like/subscribe reminder woven in naturally

Output only the script text, no meta-commentary.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
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

[INTRO]
What's up everyone, welcome back to ${ch}. I'm so glad you're here today because we are talking about ${topic} — a ${style.toLowerCase()} breakdown that covers everything you actually need to know in about ${minStr}.

If you're new here, make sure you hit that subscribe button — we drop content like this every week.

[SECTION 1: THE SETUP]
So first, let's talk about the big picture. ${topic} is one of those subjects that sounds simple on the surface, but the more you dig into it, the more nuance you find. Here's what most people get wrong from the start…

(Tone: ${tone})

[SECTION 2: THE CORE CONTENT]
Now here's where it gets really interesting. Let me walk you through the key things you need to understand.

Point one — context matters enormously here. The way ${topic} works today is completely different from even two or three years ago.

Point two — most guides skip over the foundational stuff. That's a mistake. We're not going to do that.

Point three — there are a few counterintuitive moves that top creators and experts use. I'll show you exactly what those are.

[SECTION 3: PRACTICAL TAKEAWAYS]
Alright so here's how you actually apply this. Whether you're a complete beginner or you've been in the space for years, these action steps will move the needle.

Step 1: Start with the fundamentals we covered in section one.
Step 2: Apply the framework from section two to your specific situation.
Step 3: Iterate. Don't wait for perfect.

[CTA]
If you want to go even deeper on ${topic}, I've put together some additional resources — check the description below. And if this video helped you at all, the single best thing you can do is leave a like. It genuinely helps this channel grow and tells the algorithm to show this to more people who need it.

[OUTRO]
That's it for today. Thank you so much for watching all the way to the end — it means a lot. I'll see you in the next one. Take care.`;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
