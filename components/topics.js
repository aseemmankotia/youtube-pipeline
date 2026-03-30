/**
 * Trending Topics Component
 * Uses Brave Search API (or falls back to DuckDuckGo-style heuristic demo data)
 * to surface the top 5 trending topics for a given niche.
 */

const NICHES = [
  'AI & Technology', 'Personal Finance', 'Health & Fitness',
  'Gaming', 'Cooking & Food', 'Travel', 'Self-Improvement',
  'Crypto & Web3', 'Science', 'Business & Entrepreneurship',
];

// Curated seed topics per niche used when no live search key is configured
const SEED_TOPICS = {
  'AI & Technology': [
    { title: 'OpenAI GPT-5 capabilities breakdown', desc: 'Deep dive into what GPT-5 can and cannot do vs. previous models.', trend: 'Hot' },
    { title: 'Claude vs ChatGPT vs Gemini 2025', desc: 'Side-by-side comparison of leading AI assistants today.', trend: 'Trending' },
    { title: 'AI agents replacing software jobs?', desc: 'Are autonomous AI agents a threat or tool for developers?', trend: 'Viral' },
    { title: 'Building apps with local LLMs (Ollama)', desc: 'Run your own private AI — privacy, cost, speed.', trend: 'Rising' },
    { title: 'Apple\'s AI chip M4 Ultra explained', desc: 'What makes Apple Silicon so efficient for on-device AI?', trend: 'New' },
  ],
  'Personal Finance': [
    { title: 'High-yield savings vs. T-bills in 2025', desc: 'Where to park your emergency fund for max return.', trend: 'Hot' },
    { title: 'Index fund investing for beginners', desc: 'Everything a newbie needs to start with index funds.', trend: 'Trending' },
    { title: 'How to negotiate a higher salary', desc: 'Scripts and tactics that actually work.', trend: 'Viral' },
    { title: 'FIRE movement: retire by 40', desc: 'Realistic breakdown of Financial Independence / Early Retirement.', trend: 'Rising' },
    { title: 'Credit card rewards maximisation', desc: 'Turn everyday spend into free flights and cashback.', trend: 'New' },
  ],
  'Gaming': [
    { title: 'GTA VI release date & what we know', desc: 'Everything confirmed about the most anticipated game ever.', trend: 'Hot' },
    { title: 'Best budget gaming PC builds 2025', desc: 'Top-tier performance under $800.', trend: 'Trending' },
    { title: 'Palworld surpasses 50M players', desc: 'Why this indie hit keeps growing.', trend: 'Viral' },
    { title: 'Xbox vs PlayStation in 2025', desc: 'Which console ecosystem wins this generation?', trend: 'Rising' },
    { title: 'Speedrunning world records broken', desc: 'Latest incredible speedrun feats explained.', trend: 'New' },
  ],
};

// Fallback generic topics when niche not in SEED_TOPICS
function genericTopics(niche) {
  return [
    { title: `Top trends in ${niche} right now`, desc: `What's dominating ${niche} content this month.`, trend: 'Hot' },
    { title: `Beginner's guide to ${niche}`, desc: `Everything a newcomer needs to know to get started.`, trend: 'Trending' },
    { title: `${niche} mistakes everyone makes`, desc: 'Common pitfalls and how to avoid them.', trend: 'Viral' },
    { title: `How to grow a ${niche} YouTube channel`, desc: 'Tactics that actually work in this niche.', trend: 'Rising' },
    { title: `Future of ${niche} — 2025 and beyond`, desc: 'Predictions and emerging directions.', trend: 'New' },
  ];
}

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

  const fetchBtn = container.querySelector('#fetch-topics-btn');
  fetchBtn.addEventListener('click', () => fetchTopics(container, onTopicSelect));
}

async function fetchTopics(container, onTopicSelect) {
  const nicheSelect = container.querySelector('#niche-select').value;
  const customNiche = container.querySelector('#custom-niche').value.trim();
  const niche = customNiche || nicheSelect;

  const statusEl = container.querySelector('#topics-status');
  const resultsEl = container.querySelector('#topics-results');
  const btn = container.querySelector('#fetch-topics-btn');

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Searching…</span>';
  statusEl.innerHTML = '';
  resultsEl.innerHTML = '';

  try {
    // Attempt live web search via a CORS-friendly public endpoint.
    // Replace this URL with your own proxy / Brave Search API if available.
    let topics = null;

    try {
      topics = await liveSearch(niche);
    } catch (_) {
      // Live search unavailable — use seed/generic data
    }

    if (!topics || topics.length === 0) {
      topics = SEED_TOPICS[niche] || genericTopics(niche);
      statusEl.innerHTML = `
        <div class="status-bar info">
          Showing curated trending topics for <strong>${niche}</strong>.
          Connect a search API for live results.
        </div>`;
    } else {
      statusEl.innerHTML = `
        <div class="status-bar success">
          Live trends fetched for <strong>${niche}</strong>.
        </div>`;
    }

    renderTopicCards(resultsEl, topics, niche, onTopicSelect);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Search Trends</span>';
  }
}

/**
 * Attempt a live DuckDuckGo instant-answer lookup.
 * This is a lightweight, no-key-required endpoint — returns related topics
 * when available. For production, swap with Brave Search / SerpAPI / etc.
 */
async function liveSearch(niche) {
  const query = encodeURIComponent(`${niche} youtube trending 2025`);
  const url = `https://api.duckduckgo.com/?q=${query}&format=json&no_redirect=1&skip_disambig=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('Search unavailable');
  const data = await res.json();

  const related = (data.RelatedTopics || [])
    .filter(t => t.Text && t.FirstURL)
    .slice(0, 5)
    .map((t, i) => ({
      title: t.Text.split(' - ')[0] || t.Text.slice(0, 60),
      desc: t.Text.split(' - ')[1] || t.Text.slice(0, 120),
      trend: ['Hot', 'Trending', 'Viral', 'Rising', 'New'][i] || 'Trending',
    }));

  return related.length >= 3 ? related : null;
}

function renderTopicCards(container, topics, niche, onTopicSelect) {
  container.innerHTML = `
    <div class="card">
      <h2>Top 5 Trending — ${niche}</h2>
      <div class="topics-grid">
        ${topics.map((t, i) => `
          <div class="topic-item" data-index="${i}">
            <div class="topic-content">
              <div class="topic-title">${escHtml(t.title)}</div>
              <div class="topic-desc">${escHtml(t.desc)}</div>
            </div>
            <span class="topic-badge">${escHtml(t.trend)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.topic-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.topic-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      const topic = topics[parseInt(el.dataset.index)];
      onTopicSelect(topic, niche);
    });
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
