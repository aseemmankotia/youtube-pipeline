/**
 * Trending Topics Component
 * Uses the Claude API with the web_search tool to fetch the top 50
 * genuinely trending topics for any niche in real time.
 */

import { getSettings } from './settings.js';

const NICHES = [
  'AI & Technology', 'Personal Finance', 'Health & Fitness',
  'Gaming', 'Cooking & Food', 'Travel', 'Self-Improvement',
  'Crypto & Web3', 'Science', 'Business & Entrepreneurship',
];

export function renderTopics(container, onTopicSelect) {
  container.innerHTML = `
    <div class="card">
      <h2>Discover Trending Topics</h2>
      <div class="form-row">
        <div class="form-group">
          <label for="niche-select">Your Niche</label>
          <select id="niche-select">
            ${NICHES.map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="custom-niche">Or enter a custom niche</label>
          <input type="text" id="custom-niche" placeholder="e.g. Woodworking, Mindfulness…" />
        </div>
      </div>
      <button class="btn btn-primary" id="fetch-topics-btn">
        <span>Search Trends</span>
      </button>
      <div id="topics-status"></div>
    </div>
    <div id="topics-results"></div>
  `;

  container.querySelector('#fetch-topics-btn')
    .addEventListener('click', () => fetchTopics(container, onTopicSelect));
}

async function fetchTopics(container, onTopicSelect) {
  const nicheSelect = container.querySelector('#niche-select').value;
  const customNiche = container.querySelector('#custom-niche').value.trim();
  const niche = customNiche || nicheSelect;

  const statusEl  = container.querySelector('#topics-status');
  const resultsEl = container.querySelector('#topics-results');
  const btn       = container.querySelector('#fetch-topics-btn');

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Searching…</span>';
  statusEl.innerHTML  = `
    <div class="status-bar info">
      <span class="loader"></span>
      Searching the web for trending topics in <strong>${escHtml(niche)}</strong>…
    </div>`;
  resultsEl.innerHTML = '';

  try {
    const topics = await liveSearch(niche);
    statusEl.innerHTML = `
      <div class="status-bar success">
        Found ${topics.length} live trending topics for <strong>${escHtml(niche)}</strong>.
      </div>`;
    renderTopicCards(resultsEl, topics, niche, onTopicSelect);
  } catch (err) {
    statusEl.innerHTML = `
      <div class="status-bar error">
        ${escHtml(err.message)}
      </div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Search Trends</span>';
  }
}

async function liveSearch(niche) {
  const { claudeApiKey } = getSettings();
  if (!claudeApiKey) {
    throw new Error('Anthropic API key missing — add it in ⚙ Settings to fetch live topics.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        },
      ],
      system: `You are a YouTube content strategist. Search the web to find the 50 most trending, viral, or talked-about topics RIGHT NOW in the niche provided. Focus on topics with genuine audience interest, recent news hooks, or growing search volume. Return ONLY a valid JSON array — no markdown fences, no preamble, no trailing text. Each item must have exactly these fields: { "title": "...", "summary": "2-sentence description of why this is trending", "tags": ["tag1","tag2","tag3"], "hook": "One compelling opening line for a YouTube video" }`,
      messages: [
        {
          role: 'user',
          content: `Search the web and find the top 50 trending topics this week for a YouTube channel about: ${niche}. Search for recent news, discussions, viral content, and growing search trends. Return only the JSON array.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API error (${res.status}): ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();

  // Find the final text block — it follows any tool_use / tool_result blocks
  const textBlock = [...(data.content || [])].reverse().find(b => b.type === 'text');
  if (!textBlock) throw new Error('No text response from Claude. Please try again.');

  // Strip any accidental markdown fences before parsing
  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Claude returned an unexpected format. Please try again.');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('No topics returned. Please try again.');
  }

  // Normalise fields so the rest of the UI always gets { title, desc, trend }
  return parsed.map((item, i) => ({
    title: String(item.title || '').trim(),
    desc:  String(item.summary || item.desc || '').trim(),
    trend: (item.tags && item.tags[0]) ? String(item.tags[0]) : 'Trending',
    hook:  String(item.hook || '').trim(),
    tags:  Array.isArray(item.tags) ? item.tags : [],
  })).filter(t => t.title);
}

function renderTopicCards(container, topics, niche, onTopicSelect) {
  container.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <h2 style="margin:0;">
          Trending Now — ${escHtml(niche)}
          <span style="color:var(--muted);font-weight:400;font-size:0.85rem;margin-left:8px;">
            ${topics.length} topic${topics.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <input type="text" id="topics-filter"
          placeholder="Filter topics…"
          style="width:220px;padding:7px 12px;background:var(--surface2);border:1px solid var(--border);
                 border-radius:6px;color:var(--text);font-size:0.88rem;" />
      </div>
      <div class="topics-grid topics-scroll" id="topics-list">
        ${topics.map((t, i) => topicCardHtml(t, i)).join('')}
      </div>
      <p id="topics-empty" style="display:none;text-align:center;color:var(--muted);padding:24px 0;">
        No topics match your filter.
      </p>
    </div>
  `;

  // Click to select — pass hook through so script tab can use it
  container.querySelectorAll('.topic-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.topic-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      onTopicSelect(topics[parseInt(el.dataset.index)], niche);
    });
  });

  // Filter box
  container.querySelector('#topics-filter').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    let visible = 0;
    container.querySelectorAll('.topic-item').forEach(el => {
      const show = !q || el.textContent.toLowerCase().includes(q);
      el.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    container.querySelector('#topics-empty').style.display = visible === 0 ? 'block' : 'none';
  });
}

function topicCardHtml(t, i) {
  return `
    <div class="topic-item" data-index="${i}">
      <span class="topic-number">${i + 1}</span>
      <div class="topic-content">
        <div class="topic-title">${escHtml(t.title)}</div>
        <div class="topic-desc">${escHtml(t.desc)}</div>
      </div>
      <span class="topic-badge">${escHtml(t.trend)}</span>
    </div>
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
