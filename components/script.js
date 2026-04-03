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
      script = await generateWithClaude({ topic, tone, length, style, channel, apiKey });
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

async function generateWithClaude({ topic, tone, length, style, channel, apiKey }) {
  const channelLine = channel ? ` The channel is called "${channel}".` : '';
  const ch = channel || 'this channel';
  const prompt = `You are a professional YouTube scriptwriter.
Write a complete, ready-to-record YouTube script for a ${style} video.${channelLine}

Topic: ${topic}
Tone: ${tone}
Target video length: ${length}

## REQUIRED STRUCTURE — follow this exactly:

[HOOK]
First 15 seconds. Grab attention with a bold question, surprising fact, or provocative statement directly tied to the topic. Make them need to keep watching.

[OPENING]
Immediately after the hook — before any main content:
• Warmly thank viewers for clicking and watching (genuine, not robotic)
• Natural subscribe ask — tie it to the channel's value: something like "If this is the kind of content you're into, subscribe — we cover [niche] every week"
• Like-button ask tied to a SPECIFIC, relatable situation about the topic — e.g. "Hit the like button if you've ever [specific frustrating/exciting/relatable moment tied to ${topic}]" — make it feel earned and human

[SECTION 1] / [SECTION 2] / [SECTION 3] (add more as needed for the target length)
• Natural spoken language — write for the ear, not the eye
• Short punchy sentences during high-energy moments, longer ones when explaining
• Real examples, analogies, or brief stories to ground abstract ideas
• Smooth transitions: end each section with a bridge line into the next

[CLOSING]
End with ALL of the following, woven naturally into the ${tone} tone:
1. Recap — "So here's what we covered today:" then list the 3 most important things they learned. Make it feel like a satisfying payoff, not a bullet list. Frame each as insight, not just topic.
2. Like ask — "If you got value from this video, smash that like button — it genuinely helps more people find this content and keeps this channel growing"
3. Subscribe + bell — "And if you haven't already, subscribe and hit the notification bell — our next video is going to be about [tease a compelling related topic that feels like a natural next step from today's content]"
4. Comment question — "Drop a comment below — [pose ONE specific, thought-provoking question directly tied to ${topic} that invites personal stories, opinions, or experiences. Not generic like 'what do you think?' — make it specific]"
5. Sign-off — "See you in the next one!" or a natural sign-off that fits the ${tone} tone

## STYLE NOTES
- The opening and closing must feel human and conversational, not scripted or robotic
- Never say "Don't forget to like and subscribe" on its own — always tie it to something specific
- The comment question should make people actually want to answer it
- Match the ${tone} tone throughout — adjust energy, vocabulary, and pacing accordingly

Output only the script text. No meta-commentary outside of the section labels.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
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
