/**
 * Trending Topics Component
 * Uses the Claude API with the web_search tool to fetch the top 20
 * genuinely trending topics for any niche in real time.
 * Results are cached in localStorage for 24 hours.
 */

import { getSettings }                           from './settings.js';
import { trackUsage, trackCacheSaving,
         TOPIC_SEARCH_COST, getAllTimeSavings,
         fmtCost }                               from './usage.js';

const NICHES = [
  'AI & Technology', 'Personal Finance', 'Health & Fitness',
  'Gaming', 'Cooking & Food', 'Travel', 'Self-Improvement',
  'Crypto & Web3', 'Science', 'Business & Entrepreneurship',
];

const CACHE_TTL    = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_PREFIX = 'topics_cache_';

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(niche)  { return CACHE_PREFIX + niche; }

function loadCache(niche) {
  try {
    const raw = localStorage.getItem(cacheKey(niche));
    if (!raw) return null;
    const c = JSON.parse(raw);
    if ((Date.now() - c.timestamp) < CACHE_TTL) return c;
  } catch {}
  return null;
}

function saveCache(niche, topics) {
  try {
    localStorage.setItem(cacheKey(niche), JSON.stringify({
      topics, timestamp: Date.now(), niche,
    }));
  } catch {}
}

function deleteCache(niche) {
  localStorage.removeItem(cacheKey(niche));
}

function clearAllCaches() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(k => localStorage.removeItem(k));
}

function getCachedNiches() {
  return Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .map(k => {
      try {
        const c = JSON.parse(localStorage.getItem(k));
        if ((Date.now() - c.timestamp) < CACHE_TTL) return c.niche;
      } catch {}
      return null;
    })
    .filter(Boolean);
}

function cacheAgeHours(niche) {
  try {
    const raw = localStorage.getItem(cacheKey(niche));
    if (!raw) return null;
    const c = JSON.parse(raw);
    return ((Date.now() - c.timestamp) / 3_600_000).toFixed(1);
  } catch { return null; }
}

function cacheRemainingHours(niche) {
  try {
    const raw = localStorage.getItem(cacheKey(niche));
    if (!raw) return null;
    const c = JSON.parse(raw);
    const remaining = CACHE_TTL - (Date.now() - c.timestamp);
    return Math.max(0, Math.ceil(remaining / 3_600_000));
  } catch { return null; }
}

// ── Render ────────────────────────────────────────────────────────────────────

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
      <button class="btn btn-secondary" id="clear-cache-btn"
        style="font-size:0.78rem;padding:5px 12px;">
        🗑 Clear all cached topics
      </button>
      <div id="topics-status"></div>
      <div id="cache-savings-display" style="font-size:0.8rem;color:#7af57a;margin-top:8px;display:none;"></div>
    </div>
    <div id="topics-results"></div>
  `;

  // Mark cached niches in dropdown with ⚡
  updateNicheDropdown(container);

  // Update cache savings display
  updateCacheSavingsDisplay(container);

  container.querySelector('#fetch-topics-btn')
    .addEventListener('click', () => fetchTopics(container, onTopicSelect, false));

  container.querySelector('#clear-cache-btn')
    .addEventListener('click', () => {
      const cachedCount = getCachedNiches().length;
      clearAllCaches();
      updateNicheDropdown(container);
      updateCacheSavingsDisplay(container);
      const statusEl = container.querySelector('#topics-status');
      statusEl.innerHTML = `<div class="status-bar info">🗑 Cleared ${cachedCount} cached niche${cachedCount !== 1 ? 's' : ''}.</div>`;
      setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
    });
}

function updateNicheDropdown(container) {
  const cached = getCachedNiches();
  const select = container.querySelector('#niche-select');
  if (!select) return;
  Array.from(select.options).forEach(opt => {
    const isCached = cached.includes(opt.value);
    opt.textContent = isCached ? `${opt.value} ⚡` : opt.value;
  });
}

function updateCacheSavingsDisplay(container) {
  const total = getAllTimeSavings();
  const el    = container.querySelector('#cache-savings-display');
  if (!el) return;
  if (total > 0) {
    el.style.display = 'block';
    el.textContent   = `⚡ Cache has saved you ${fmtCost(total)} so far`;
  } else {
    el.style.display = 'none';
  }
}

// ── Fetch (cache-aware) ───────────────────────────────────────────────────────

async function fetchTopics(container, onTopicSelect, forceRefresh) {
  const nicheSelect = container.querySelector('#niche-select').value;
  const customNiche = container.querySelector('#custom-niche').value.trim();
  // Strip the ⚡ marker that may have been added to the option text
  const niche = (customNiche || nicheSelect).replace(/\s*⚡$/, '');

  const statusEl  = container.querySelector('#topics-status');
  const resultsEl = container.querySelector('#topics-results');
  const btn       = container.querySelector('#fetch-topics-btn');

  // ── Check cache ──────────────────────────────────────────────────────────
  if (!forceRefresh) {
    const cached = loadCache(niche);
    if (cached) {
      const hoursLeft = cacheRemainingHours(niche);
      statusEl.innerHTML = `
        <div class="status-bar success" style="flex-direction:column;align-items:flex-start;gap:6px;">
          <span>⚡ Loaded from cache (saved ~${fmtCost(TOPIC_SEARCH_COST)}) · Refreshes in ${hoursLeft}h
            <button id="force-refresh-btn" class="link-btn"
              style="margin-left:10px;color:#7ab8f5;text-decoration:underline;
                     background:none;border:none;cursor:pointer;font-size:inherit;">
              Force refresh
            </button>
          </span>
        </div>`;

      container.querySelector('#force-refresh-btn')?.addEventListener('click', () => {
        deleteCache(niche);
        updateNicheDropdown(container);
        fetchTopics(container, onTopicSelect, true);
      });

      trackCacheSaving('topic_search', TOPIC_SEARCH_COST, { niche });
      updateCacheSavingsDisplay(container);
      renderTopicCards(resultsEl, cached.topics, niche, onTopicSelect);
      return;
    }
  }

  // ── Live API call ────────────────────────────────────────────────────────
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Searching…</span>';
  statusEl.innerHTML = `
    <div class="status-bar info">
      <span class="loader"></span>
      Searching the web for trending topics in <strong>${escHtml(niche)}</strong>…
    </div>`;
  resultsEl.innerHTML = '';

  try {
    const { topics, inputTokens, outputTokens } = await liveSearch(niche, statusEl);

    // Cache result
    saveCache(niche, topics);
    updateNicheDropdown(container);

    // Track usage
    trackUsage('topic_search', inputTokens, outputTokens, { niche });

    statusEl.innerHTML = `
      <div class="status-bar success">
        🔍 Live search complete · Showing top ${topics.length} topics for
        <strong>${escHtml(niche)}</strong> · Results cached for 24 hours
      </div>`;

    renderTopicCards(resultsEl, topics, niche, onTopicSelect);
  } catch (err) {
    statusEl.innerHTML = `<div class="status-bar error">${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Search Trends</span>';
  }
}

// ── Retry with exponential backoff ────────────────────────────────────────────

async function fetchWithRetry(url, options, statusEl) {
  const delays = [10, 30];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    if (attempt === delays.length) return res;
    const wait = delays[attempt];
    await showCountdown(statusEl, wait);
  }
}

async function showCountdown(statusEl, seconds) {
  for (let i = seconds; i > 0; i--) {
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="status-bar error">
          Rate limit hit — retrying in <strong>${i}s</strong>…
        </div>`;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ── Claude live search ────────────────────────────────────────────────────────

async function liveSearch(niche, statusEl) {
  const { claudeApiKey } = getSettings();
  if (!claudeApiKey) {
    throw new Error('Anthropic API key missing — add it in ⚙ Settings to fetch live topics.');
  }

  const res = await fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a YouTube content strategist. Use web search to find 20 trending topics this week in the given niche. Return ONLY a JSON array with no markdown or preamble. Each item: {title, summary (1 sentence), tags (3 max), hook (1 sentence)}`,
        messages: [{
          role: 'user',
          content: `Find the top 20 trending topics this week for a YouTube channel about: ${niche}. Search recent news, discussions, and viral content. Return only the JSON array.`,
        }],
      }),
    },
    statusEl
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error('Rate limit hit — please wait 30 seconds and try again.');
    throw new Error(`Claude API error (${res.status}): ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();

  // Extract token usage
  const inputTokens  = data.usage?.input_tokens  || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  console.log('[topics] content blocks:', (data.content || []).map(b => ({
    type: b.type,
    textPreview: b.type === 'text' ? b.text?.slice(0, 120) : undefined,
  })));

  const textBlocks = (data.content || []).filter(b => b.type === 'text');
  if (!textBlocks.length) throw new Error('No text response from Claude. Please try again.');

  const fullText = textBlocks[textBlocks.length - 1].text || '';

  let parsed;
  try {
    const clean = fullText.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in response');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('[topics] parse failed. Full text:', fullText);
    throw new Error('Could not parse topics: ' + e.message);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Invalid topics format returned. Please try again.');
  }

  const topics = parsed.map(item => ({
    title: String(item.title || '').trim(),
    desc:  String(item.summary || item.desc || '').trim(),
    trend: (item.tags && item.tags[0]) ? String(item.tags[0]) : 'Trending',
    hook:  String(item.hook || '').trim(),
    tags:  Array.isArray(item.tags) ? item.tags : [],
  })).filter(t => t.title);

  return { topics, inputTokens, outputTokens };
}

// ── Topic cards ───────────────────────────────────────────────────────────────

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

  container.querySelectorAll('.topic-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.topic-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      onTopicSelect(topics[parseInt(el.dataset.index)], niche);
    });
  });

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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
