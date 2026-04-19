/**
 * Trending Topics Component
 * Uses the Claude API with the web_search tool to fetch the top 20
 * genuinely trending topics for any niche in real time.
 * Results are cached in localStorage for 24 hours.
 */

import { trackUsage, trackCacheSaving,
         TOPIC_SEARCH_COST, getAllTimeSavings,
         fmtCost }                               from './usage.js';

const NICHES = [
  'AI & Technology', 'Personal Finance', 'Health & Fitness',
  'Gaming', 'Cooking & Food', 'Travel', 'Self-Improvement',
  'Crypto & Web3', 'Science', 'Business & Entrepreneurship',
];

const CACHE_TTL    = 6 * 60 * 60 * 1000; // 6 hours — stale topics risk
const CACHE_PREFIX = 'topics_cache_';

// ── Cache helpers ─────────────────────────────────────────────────────────────

// Include today's date in the key so yesterday's results are never served today.
function cacheKey(niche) {
  const dateKey = new Date().toISOString().split('T')[0]; // "2026-04-08"
  return `${CACHE_PREFIX}${niche}_${dateKey}`;
}

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
      <button class="btn btn-secondary" id="refresh-topics-btn"
        style="font-size:0.85rem;padding:6px 14px;" title="Run a second search with different queries for more variety">
        🔄 Refresh results
      </button>
      <button class="btn btn-secondary" id="clear-cache-btn"
        style="font-size:0.78rem;padding:5px 12px;">
        🗑 Clear all cached topics
      </button>
      <style>
        .topic-freshness{display:flex;align-items:center;gap:6px;margin-top:5px;flex-wrap:wrap;}
        .fresh-badge{font-size:11px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2);
          color:#00d4ff;padding:2px 8px;border-radius:10px;}
        .source-hint{font-size:11px;color:#4a6fa5;font-style:italic;}
      </style>
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
    .addEventListener('click', () => fetchTopics(container, onTopicSelect, false, 'primary'));

  container.querySelector('#refresh-topics-btn')
    .addEventListener('click', () => fetchTopics(container, onTopicSelect, true, 'secondary'));

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

async function fetchTopics(container, onTopicSelect, forceRefresh, queryMode = 'primary') {
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
    const { topics, inputTokens, outputTokens } = await liveSearch(niche, statusEl, queryMode);

    // Cache result
    saveCache(niche, topics);
    updateNicheDropdown(container);

    // Track usage
    trackUsage('topic_search', inputTokens, outputTokens, { niche });

    statusEl.innerHTML = `
      <div class="status-bar success">
        🔍 Live search complete · Showing top ${topics.length} topics for
        <strong>${escHtml(niche)}</strong> · Results cached for 6 hours
      </div>`;

    renderTopicCards(resultsEl, topics, niche, onTopicSelect);
  } catch (err) {
    statusEl.innerHTML = `<div class="status-bar error">${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Search Trends</span>';
  }
}

// ── Fix 3: filter out topics referencing content older than 90 days ───────────

function filterRecentTopics(topics) {
  const currentYear = new Date().getFullYear();
  const lastYear    = currentYear - 1;
  return topics.filter(topic => {
    const text = `${topic.title} ${topic.desc}`.toLowerCase();
    const oldPatterns = [
      `in ${lastYear}`, `of ${lastYear}`, `${lastYear} study`,
      `${lastYear} report`, `since ${lastYear}`, `back in ${lastYear}`,
    ];
    const isOld = oldPatterns.some(p => text.includes(p));
    if (isOld) console.log('[topics] filtered stale topic:', topic.title);
    return !isOld;
  });
}

// ── Live search via window.callAI (Anthropic with web search, Gemini fallback) ─

async function liveSearch(niche, statusEl, queryMode = 'primary') {
  // Fix 1 & 6: date-aware queries; secondary set used by "Refresh results"
  const today         = new Date();
  const ninetyDaysAgo = new Date(today - 90 * 24 * 60 * 60 * 1000);
  const dateStr       = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const cutoffStr     = ninetyDaysAgo.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const monthYear     = today.toLocaleString('en-US', { month: 'long' }) + ' ' + today.getFullYear();

  const primaryQueries = [
    `${niche} news ${today.getFullYear()}`,
    `${niche} trends last 30 days`,
    `${niche} latest developments ${monthYear}`,
    `${niche} viral topics this week`,
  ];
  const secondaryQueries = [
    `${niche} breaking news today`,
    `latest ${niche} announcements ${dateStr}`,
    `${niche} community discussion this week`,
  ];
  const queries = queryMode === 'secondary' ? secondaryQueries : primaryQueries;

  // Fix 2: strict recency system prompt
  const systemPrompt =
    `You are a YouTube content strategist helping find trending topics RIGHT NOW in ${today.getFullYear()}.

Today's date is ${dateStr}.

CRITICAL RULES:
1. You MUST use the web search tool to find current topics
2. ONLY return topics that have recent web search results from the last 90 days (after ${cutoffStr})
3. NEVER suggest topics based on your training data alone
4. If web search returns no recent results for a niche, say so rather than inventing topics
5. Each topic must be something actively discussed online RIGHT NOW — not something from ${today.getFullYear() - 1} or earlier
6. Verify each topic has recent sources before including it

Quality check before returning each topic:
- Did web search return results from last 90 days? If no → exclude
- Is there a specific recent event driving interest? If no → exclude
- Would someone searching this week find fresh content? If no → exclude

Return ONLY a JSON array with no markdown or preamble.
Each item: {title, summary (1 sentence, include "Trending since [month year]"), tags (3 max), hook (1 sentence), trending_since (e.g. "April 2026"), source_hint (brief trigger for the trend)}`;

  const userMsg =
    `Today is ${dateStr}.

Search the web for trending topics in: ${niche}

Run these specific searches to find ONLY recent content:
${queries.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

STRICT RULES:
- ONLY include topics where you found web search results dated after ${cutoffStr}
- If a topic's most recent source is older than 90 days, EXCLUDE it completely
- NEVER use your training data to fill in topics — only use what web search returns
- Each topic MUST have a specific recent event or development that makes it trending RIGHT NOW
- Include the approximate date of the trending event in the summary field

Return 20 topics as JSON array with fields: title, summary, tags, hook, trending_since, source_hint`;

  const { text: fullText, inputTokens, outputTokens } = await window.callAI({
    systemPrompt,
    prompt: userMsg,
    maxTokens: 4000,
    requiresWebSearch: true,
    action: 'topic_search',
  });

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

  const mapped = parsed.map(item => ({
    title:          String(item.title        || '').trim(),
    desc:           String(item.summary      || item.desc || '').trim(),
    trend:          (item.tags && item.tags[0]) ? String(item.tags[0]) : 'Trending',
    hook:           String(item.hook         || '').trim(),
    tags:           Array.isArray(item.tags) ? item.tags : [],
    trending_since: String(item.trending_since || '').trim(),
    source_hint:    String(item.source_hint  || '').trim(),
  })).filter(t => t.title);

  // Fix 3: drop any topics that reference content clearly older than 90 days
  const topics = filterRecentTopics(mapped);

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
  const freshnessHtml = (t.trending_since || t.source_hint) ? `
    <div class="topic-freshness">
      ${t.trending_since ? `<span class="fresh-badge">🔥 ${escHtml(t.trending_since)}</span>` : ''}
      ${t.source_hint    ? `<span class="source-hint">${escHtml(t.source_hint)}</span>`        : ''}
    </div>` : '';
  return `
    <div class="topic-item" data-index="${i}">
      <span class="topic-number">${i + 1}</span>
      <div class="topic-content">
        <div class="topic-title">${escHtml(t.title)}</div>
        <div class="topic-desc">${escHtml(t.desc)}</div>
        ${freshnessHtml}
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
