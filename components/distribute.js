/**
 * Distribute Component — Tab 5
 * Auto-populates after YouTube upload with video data and offers
 * three independent distribution cards: Reddit, Article, Highlight Clip.
 */

import { getSettings } from './settings.js';
import { trackUsage }  from './usage.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setCardStatus(card, type, html) {
  const el = card.querySelector('.dist-card-status');
  if (!el) return;
  el.className = `dist-card-status status-bar ${type}`;
  el.style.display = 'flex';
  el.innerHTML = html;
}

function clearCardStatus(card) {
  const el = card.querySelector('.dist-card-status');
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
}

async function callClaude(apiKey, { system, user, maxTokens = 1500 }) {
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
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Claude API error: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  trackUsage('script_gen',
    data.usage?.input_tokens  || 0,
    data.usage?.output_tokens || 0);
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return text;
}

function parseJSON(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]+?)```/) || text.match(/(\{[\s\S]+\})/);
  if (!match) throw new Error('No JSON found in response.');
  return JSON.parse(match[1]);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderDistribute(container) {
  container.innerHTML = `
    <!-- Waiting state -->
    <div id="dist-waiting" class="card" style="text-align:center;padding:48px 24px;">
      <p style="font-size:2rem;margin-bottom:16px;">📡</p>
      <h2 style="margin-bottom:8px;">Distribute Your Video</h2>
      <p style="color:var(--muted);font-size:0.95rem;">
        Complete the YouTube upload in <strong>Tab 4</strong> to enable distribution options.
      </p>
    </div>

    <!-- Ready banner + cards (hidden until video data arrives) -->
    <div id="dist-ready" style="display:none;">
      <div id="dist-banner"
        style="background:#0d2a0d;border:1px solid #155a15;color:#7af57a;
               border-radius:var(--radius);padding:14px 20px;margin-bottom:20px;
               display:flex;align-items:center;gap:12px;font-size:0.92rem;">
        ✅ Ready to distribute: <strong id="dist-banner-title" style="margin-left:4px;"></strong>
        <a id="dist-banner-yt-link" href="#" target="_blank" rel="noopener"
          style="margin-left:auto;color:#7af57a;font-size:0.82rem;text-decoration:underline;">
          View on YouTube ↗
        </a>
      </div>

      <!-- ── Card 1: Reddit ─────────────────────────────────────────────────── -->
      <div class="card" id="dist-reddit-card">
        <h2 style="margin-bottom:4px;">🟠 Post to Reddit</h2>
        <p style="color:var(--muted);font-size:0.84rem;margin-bottom:16px;">
          Claude picks the most relevant subreddits, generates a Reddit-optimised title,
          and posts your video as a link submission.
        </p>

        <div class="dist-card-status status-bar" style="display:none;"></div>

        <!-- Subreddit suggestions area -->
        <div id="reddit-suggestions" style="display:none;margin-bottom:14px;">
          <label style="margin-bottom:8px;">Subreddits to post to:</label>
          <div id="reddit-sub-checkboxes" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
        </div>

        <!-- Generated title preview -->
        <div id="reddit-title-preview" style="display:none;margin-bottom:14px;">
          <label>Post title:</label>
          <input type="text" id="reddit-title-input"
            style="font-size:0.9rem;" placeholder="Reddit post title" />
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="reddit-suggest-btn">
            🤖 Suggest Subreddits
          </button>
          <button class="btn btn-primary" id="reddit-post-btn" style="display:none;">
            Post to Reddit
          </button>
        </div>

        <div id="reddit-results" style="margin-top:14px;display:none;">
          <div id="reddit-result-rows"
            style="display:flex;flex-direction:column;gap:8px;font-size:0.88rem;"></div>
        </div>

        <p style="font-size:0.78rem;color:var(--muted);margin-top:12px;">
          ⚠️ Reddit requires OAuth via their servers. If posting fails with a network error,
          configure Reddit credentials in Settings and ensure your app is set to "script" type.
        </p>
      </div>

      <!-- ── Card 2: Article ────────────────────────────────────────────────── -->
      <div class="card" id="dist-article-card">
        <h2 style="margin-bottom:4px;">📝 Publish Article</h2>
        <p style="color:var(--muted);font-size:0.84rem;margin-bottom:16px;">
          Claude converts your script into a written blog article,
          then publishes it to Dev.to and/or Hashnode automatically.
        </p>

        <div class="dist-card-status status-bar" style="display:none;"></div>

        <!-- Article preview area -->
        <div id="article-preview" style="display:none;margin-bottom:14px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
            <div class="form-group">
              <label>Title</label>
              <input type="text" id="article-title-input" style="font-size:0.88rem;" />
            </div>
            <div class="form-group">
              <label>Tags (comma-separated)</label>
              <input type="text" id="article-tags-input" style="font-size:0.88rem;" />
            </div>
          </div>
          <div class="form-group">
            <label>TL;DR</label>
            <textarea id="article-tldr-input" rows="2"
              style="font-size:0.85rem;resize:vertical;"></textarea>
          </div>
          <div class="form-group">
            <label>Article body (Markdown)</label>
            <textarea id="article-body-input" rows="10"
              style="font-size:0.82rem;font-family:monospace;resize:vertical;"></textarea>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="article-generate-btn">
            🤖 Generate Article
          </button>
          <button class="btn btn-primary" id="article-devto-btn" style="display:none;">
            Publish to Dev.to
          </button>
          <button class="btn btn-primary" id="article-hashnode-btn" style="display:none;">
            Publish to Hashnode
          </button>
        </div>

        <div id="article-results"
          style="margin-top:14px;display:none;display:flex;flex-direction:column;gap:8px;"></div>
      </div>

      <!-- ── Card 3: Highlight Clip ─────────────────────────────────────────── -->
      <div class="card" id="dist-highlight-card">
        <h2 style="margin-bottom:4px;">✂️ 60-Second Highlight</h2>
        <p style="color:var(--muted);font-size:0.84rem;margin-bottom:16px;">
          Auto-cut the best moment for TikTok, Reels &amp; Twitter
        </p>

        <div class="dist-card-status status-bar" style="display:none;"></div>

        <!-- Step indicator -->
        <div style="display:flex;align-items:center;margin-bottom:20px;font-size:0.76rem;gap:0;">
          <div id="hl-step-1" style="display:flex;align-items:center;gap:5px;white-space:nowrap;">
            <span class="hl-dot" style="width:8px;height:8px;border-radius:50%;background:var(--border);flex-shrink:0;transition:background .2s;"></span>
            Main video ready
          </div>
          <div style="flex:1;height:1px;background:var(--border);margin:0 8px;min-width:12px;"></div>
          <div id="hl-step-2" style="display:flex;align-items:center;gap:5px;white-space:nowrap;">
            <span class="hl-dot" style="width:8px;height:8px;border-radius:50%;background:var(--border);flex-shrink:0;transition:background .2s;"></span>
            Analyzing segment
          </div>
          <div style="flex:1;height:1px;background:var(--border);margin:0 8px;min-width:12px;"></div>
          <div id="hl-step-3" style="display:flex;align-items:center;gap:5px;white-space:nowrap;">
            <span class="hl-dot" style="width:8px;height:8px;border-radius:50%;background:var(--border);flex-shrink:0;transition:background .2s;"></span>
            Cutting clip
          </div>
          <div style="flex:1;height:1px;background:var(--border);margin:0 8px;min-width:12px;"></div>
          <div id="hl-step-4" style="display:flex;align-items:center;gap:5px;white-space:nowrap;">
            <span class="hl-dot" style="width:8px;height:8px;border-radius:50%;background:var(--border);flex-shrink:0;transition:background .2s;"></span>
            Ready to share
          </div>
        </div>

        <!-- Generate button -->
        <button class="btn btn-secondary" id="highlight-generate-btn">
          🎬 Generate Highlight
        </button>

        <!-- Results panel (hidden until generated) -->
        <div id="highlight-result" style="display:none;margin-top:16px;">

          <!-- Terminal instruction -->
          <div style="background:#0d1f2e;border:1px solid #1e4a7a;border-radius:var(--radius);
               padding:14px 16px;margin-bottom:14px;">
            <p style="font-size:0.82rem;color:#7ab8f5;margin-bottom:8px;font-weight:600;">
              ▶ Run in Terminal to cut the clip:
            </p>
            <code style="font-size:0.84rem;color:#e8e8e8;display:block;">npm run highlight</code>
            <button class="btn btn-secondary" id="copy-hl-cmd-btn"
              style="font-size:0.78rem;padding:4px 12px;margin-top:10px;">
              Copy Command
            </button>
          </div>

          <!-- Video preview -->
          <div style="margin-bottom:14px;">
            <p style="font-size:0.82rem;color:var(--muted);margin-bottom:8px;">
              Preview — loads after running <code>npm run highlight</code>:
            </p>
            <video id="hl-video-preview" controls
              style="width:100%;max-width:280px;border-radius:8px;display:block;background:#000;">
              <source src="highlight.mp4" type="video/mp4">
            </video>
            <button class="btn btn-secondary" id="hl-reload-btn"
              style="font-size:0.78rem;padding:4px 12px;margin-top:8px;">
              🔄 Reload Preview
            </button>
          </div>

          <!-- TikTok/Instagram caption panel -->
          <div style="background:var(--surface2);border:1px solid var(--border);
               border-radius:var(--radius);padding:16px;margin-bottom:14px;">
            <p style="font-size:0.82rem;font-weight:600;margin-bottom:10px;">📱 TikTok/Instagram Caption</p>
            <div id="hl-caption-lines"
              style="font-size:0.9rem;line-height:1.9;margin-bottom:8px;"></div>
            <div id="hl-hashtags"
              style="font-size:0.83rem;color:var(--accent);margin-bottom:12px;"></div>
            <button class="btn btn-secondary" id="copy-hl-caption-btn"
              style="font-size:0.78rem;padding:4px 12px;">Copy All</button>
          </div>

          <!-- Twitter/X post panel -->
          <div style="background:var(--surface2);border:1px solid var(--border);
               border-radius:var(--radius);padding:16px;margin-bottom:14px;">
            <p style="font-size:0.82rem;font-weight:600;margin-bottom:10px;">🐦 Twitter/X Post</p>
            <textarea id="hl-tweet" rows="6" readonly
              style="font-size:0.84rem;resize:none;background:var(--surface);width:100%;"></textarea>
            <button class="btn btn-secondary" id="copy-hl-tweet-btn"
              style="font-size:0.78rem;padding:4px 12px;margin-top:8px;">Copy</button>
          </div>

          <!-- Upload links -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
            <a href="https://www.tiktok.com/upload" target="_blank" rel="noopener"
              class="btn btn-secondary"
              style="font-size:0.84rem;text-decoration:none;">
              📱 Open TikTok
            </a>
            <a href="https://www.instagram.com" target="_blank" rel="noopener"
              class="btn btn-secondary"
              style="font-size:0.84rem;text-decoration:none;">
              📸 Open Instagram
            </a>
            <a href="https://twitter.com" target="_blank" rel="noopener"
              class="btn btn-secondary"
              style="font-size:0.84rem;text-decoration:none;">
              🐦 Open Twitter/X
            </a>
          </div>

          <button class="btn btn-secondary" id="highlight-regen-btn">
            🔄 Generate New Highlight
          </button>
        </div>
      </div>
    </div>
  `;

  // ── State ──────────────────────────────────────────────────────────────────

  container._videoData = null;
  let _article = null;

  // ── Auto-populate ──────────────────────────────────────────────────────────

  container._setVideoData = (data) => {
    container._videoData = data;
    const { title, ytUrl } = data;

    document.getElementById('dist-waiting').style.display = 'none';
    document.getElementById('dist-ready').style.display = 'block';
    document.getElementById('dist-banner-title').textContent = title || 'Video ready';
    const ytLink = document.getElementById('dist-banner-yt-link');
    if (ytUrl) { ytLink.href = ytUrl; ytLink.style.display = ''; }
    else        { ytLink.style.display = 'none'; }
  };

  // ── Card 1: Reddit ─────────────────────────────────────────────────────────

  const redditCard     = container.querySelector('#dist-reddit-card');
  const suggestBtn     = container.querySelector('#reddit-suggest-btn');
  const redditPostBtn  = container.querySelector('#reddit-post-btn');

  suggestBtn.addEventListener('click', async () => {
    const { claudeApiKey, redditSubreddits } = getSettings();
    if (!claudeApiKey) return setCardStatus(redditCard, 'error', 'Add a Claude API key in Settings first.');
    if (!container._videoData) return;

    const { topic } = container._videoData;
    const subList = (redditSubreddits || 'programming, webdev, learnprogramming, technology, artificial').split(',').map(s => s.trim()).filter(Boolean);

    suggestBtn.disabled = true;
    setCardStatus(redditCard, 'info', '<span class="loader"></span> Analysing topic and selecting subreddits…');

    try {
      const raw = await callClaude(claudeApiKey, {
        system: 'You are a Reddit growth expert. Return ONLY valid JSON, no prose.',
        user: `Topic: "${topic}"
Available subreddits: ${subList.join(', ')}

Choose the 3 most relevant subreddits for this topic and generate a Reddit post title.
The title must be factual, non-clickbait, and Reddit-appropriate.
Example title format: "I made a video explaining {topic} — covers X, Y, and Z"

Return JSON:
{
  "subreddits": ["sub1", "sub2", "sub3"],
  "title": "post title here",
  "reason": "one-sentence reason for these choices"
}`,
        maxTokens: 400,
      });

      const parsed = parseJSON(raw);
      const subs   = (parsed.subreddits || []).slice(0, 3);
      const title  = parsed.title || topic;

      // Render checkboxes
      const checkboxContainer = container.querySelector('#reddit-sub-checkboxes');
      checkboxContainer.innerHTML = subs.map(s => `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;
               background:var(--surface2);border:1px solid var(--border);
               border-radius:6px;padding:5px 12px;font-size:0.86rem;">
          <input type="checkbox" data-sub="${esc(s)}" checked
            style="width:14px;height:14px;accent-color:var(--accent);" />
          r/${escHtml(s)}
        </label>
      `).join('');

      container.querySelector('#reddit-title-input').value = title;
      container.querySelector('#reddit-suggestions').style.display = 'block';
      container.querySelector('#reddit-title-preview').style.display = 'block';
      redditPostBtn.style.display = '';

      setCardStatus(redditCard, 'success',
        `✅ Suggested: ${subs.map(s => `r/${s}`).join(', ')} — ${escHtml(parsed.reason || '')}`);
    } catch (err) {
      setCardStatus(redditCard, 'error', escHtml(err.message));
    } finally {
      suggestBtn.disabled = false;
    }
  });

  redditPostBtn.addEventListener('click', async () => {
    const s = getSettings();
    if (!s.redditClientId || !s.redditClientSecret || !s.redditUsername || !s.redditPassword) {
      return setCardStatus(redditCard, 'error', 'Add Reddit credentials in Settings first.');
    }
    if (!container._videoData) return;

    const checkedSubs = [...container.querySelectorAll('#reddit-sub-checkboxes input:checked')]
      .map(cb => cb.dataset.sub);
    if (!checkedSubs.length) return setCardStatus(redditCard, 'error', 'Select at least one subreddit.');

    const postTitle = container.querySelector('#reddit-title-input').value.trim() || container._videoData.title;
    const { ytUrl } = container._videoData;

    redditPostBtn.disabled = true;
    setCardStatus(redditCard, 'info', '<span class="loader"></span> Authenticating with Reddit…');

    try {
      // OAuth password flow
      const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${s.redditClientId}:${s.redditClientSecret}`),
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'YTPipeline/1.0',
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: s.redditUsername,
          password: s.redditPassword,
        }),
      });

      if (!tokenRes.ok) throw new Error(`Reddit auth failed (${tokenRes.status}). Check credentials.`);
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) throw new Error('Reddit returned no access token. Check Client ID/Secret and app type (must be "script").');

      const token = tokenData.access_token;
      const resultRows = container.querySelector('#reddit-result-rows');
      resultRows.innerHTML = '';
      container.querySelector('#reddit-results').style.display = 'block';

      setCardStatus(redditCard, 'info', `<span class="loader"></span> Posting to ${checkedSubs.length} subreddit(s)…`);

      for (const sub of checkedSubs) {
        try {
          const submitRes = await fetch('https://oauth.reddit.com/api/submit', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'YTPipeline/1.0',
            },
            body: new URLSearchParams({
              sr: sub,
              kind: 'link',
              title: postTitle,
              url: ytUrl,
              resubmit: 'true',
            }),
          });

          const submitData = await submitRes.json();
          const postUrl = submitData?.data?.url || submitData?.jquery?.find?.(j => j?.[3]?.includes?.('reddit.com/r/'))?.join?.('') || null;

          resultRows.insertAdjacentHTML('beforeend', `
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:#7af57a;">✅</span>
              <span>r/${escHtml(sub)}</span>
              ${postUrl ? `<a href="${esc(postUrl)}" target="_blank" rel="noopener"
                style="color:var(--accent);font-size:0.82rem;margin-left:4px;">View post ↗</a>` : ''}
            </div>`);

          dispatchDistributionUpdate(container, `reddit:r/${sub}`);
        } catch (subErr) {
          resultRows.insertAdjacentHTML('beforeend', `
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:#f57a7a;">❌</span>
              <span>r/${escHtml(sub)} — ${escHtml(subErr.message)}</span>
            </div>`);
        }
      }

      setCardStatus(redditCard, 'success', '✅ Posting complete. See results below.');
    } catch (err) {
      let msg = escHtml(err.message);
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        msg = 'Network error — Reddit blocks direct browser requests (CORS). ' +
              'Try running the app via a local server or use the Reddit website manually.';
      }
      setCardStatus(redditCard, 'error', msg);
    } finally {
      redditPostBtn.disabled = false;
    }
  });

  // ── Card 2: Article ────────────────────────────────────────────────────────

  const articleCard    = container.querySelector('#dist-article-card');
  const articleGenBtn  = container.querySelector('#article-generate-btn');
  const devtoBtn       = container.querySelector('#article-devto-btn');
  const hashnodeBtn    = container.querySelector('#article-hashnode-btn');
  const articleResults = container.querySelector('#article-results');

  articleGenBtn.addEventListener('click', async () => {
    const { claudeApiKey } = getSettings();
    if (!claudeApiKey) return setCardStatus(articleCard, 'error', 'Add a Claude API key in Settings first.');
    if (!container._videoData) return;

    const { script, title, ytUrl } = container._videoData;
    if (!script) return setCardStatus(articleCard, 'error', 'No script found. Re-generate the video from Tab 2.');

    articleGenBtn.disabled = true;
    setCardStatus(articleCard, 'info', '<span class="loader"></span> Converting script to article…');

    try {
      const raw = await callClaude(claudeApiKey, {
        system: `Convert YouTube video scripts into well-structured technical blog articles.
Return ONLY a JSON object — no prose, no code fences.`,
        user: `Video title: "${title}"
YouTube URL: ${ytUrl || 'not yet published'}

Script:
${script.slice(0, 6000)}

Convert to a blog article. Return JSON:
{
  "title": "article title (can differ from video title)",
  "body_markdown": "full article in markdown with ## and ### headers, TL;DR at top, conclusion at end",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "tldr": "2-3 sentence summary"
}

Rules:
- Remove all spoken phrases: "In today's video", "subscribe", "like button", "hit the bell", etc.
- Convert first-person spoken style to third-person written style
- Keep code examples if any
- Target 800-1200 words
- Add TL;DR section at the very top (## TL;DR)
- Add conclusion section at the end`,
        maxTokens: 4000,
      });

      _article = parseJSON(raw);
      _article.canonical_url = ytUrl || '';

      // Populate editable fields
      container.querySelector('#article-title-input').value = _article.title || title;
      container.querySelector('#article-tags-input').value  = (_article.tags || []).join(', ');
      container.querySelector('#article-tldr-input').value  = _article.tldr || '';
      container.querySelector('#article-body-input').value  = _article.body_markdown || '';

      container.querySelector('#article-preview').style.display = 'block';
      devtoBtn.style.display    = '';
      hashnodeBtn.style.display = '';

      setCardStatus(articleCard, 'success', '✅ Article generated — review and edit above, then publish.');
    } catch (err) {
      setCardStatus(articleCard, 'error', escHtml(err.message));
    } finally {
      articleGenBtn.disabled = false;
    }
  });

  function getArticleFromForm() {
    return {
      title:         container.querySelector('#article-title-input').value.trim(),
      body_markdown: container.querySelector('#article-body-input').value.trim(),
      tags:          container.querySelector('#article-tags-input').value.split(',').map(t => t.trim()).filter(Boolean),
      tldr:          container.querySelector('#article-tldr-input').value.trim(),
      canonical_url: container._videoData?.ytUrl || '',
    };
  }

  devtoBtn.addEventListener('click', async () => {
    const { devToApiKey } = getSettings();
    if (!devToApiKey) return setCardStatus(articleCard, 'error', 'Add Dev.to API Key in Settings first.');

    const article = getArticleFromForm();
    devtoBtn.disabled = true;
    setCardStatus(articleCard, 'info', '<span class="loader"></span> Publishing to Dev.to…');

    try {
      const body = {
        article: {
          title:         article.title,
          body_markdown: article.body_markdown +
            (article.canonical_url
              ? `\n\n---\n\n*Originally published as a video on [YouTube](${article.canonical_url})*`
              : ''),
          published:     true,
          tags:          article.tags.slice(0, 4),
          canonical_url: article.canonical_url || undefined,
        },
      };

      const res = await fetch('https://dev.to/api/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': devToApiKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Dev.to error: ${err?.error || res.statusText}`);
      }

      const data = await res.json();
      const url  = data.url || 'https://dev.to';

      articleResults.style.display = 'flex';
      articleResults.insertAdjacentHTML('beforeend', `
        <div class="status-bar success">
          ✅ Published on Dev.to:
          <a href="${esc(url)}" target="_blank" rel="noopener"
            style="color:#7af57a;margin-left:6px;">${escHtml(url)} ↗</a>
        </div>`);

      dispatchDistributionUpdate(container, `devto:${url}`);
      setCardStatus(articleCard, 'success', '✅ Dev.to published!');
    } catch (err) {
      setCardStatus(articleCard, 'error', escHtml(err.message));
    } finally {
      devtoBtn.disabled = false;
    }
  });

  hashnodeBtn.addEventListener('click', async () => {
    const { hashnodeApiKey, hashnodePublicationId } = getSettings();
    if (!hashnodeApiKey)       return setCardStatus(articleCard, 'error', 'Add Hashnode API Key in Settings first.');
    if (!hashnodePublicationId) return setCardStatus(articleCard, 'error', 'Add Hashnode Publication ID in Settings first.');

    const article = getArticleFromForm();
    hashnodeBtn.disabled = true;
    setCardStatus(articleCard, 'info', '<span class="loader"></span> Publishing to Hashnode…');

    const mutation = `
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post { id slug url }
        }
      }`;

    const variables = {
      input: {
        title:             article.title,
        publicationId:     hashnodePublicationId,
        contentMarkdown:   article.body_markdown +
          (article.canonical_url
            ? `\n\n---\n\n*Originally published as a video on [YouTube](${article.canonical_url})*`
            : ''),
        tags:              article.tags.slice(0, 5).map(t => ({
          slug: t.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: t,
        })),
        originalArticleURL: article.canonical_url || undefined,
      },
    };

    try {
      const res = await fetch('https://gql.hashnode.com/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': hashnodeApiKey,
        },
        body: JSON.stringify({ query: mutation, variables }),
      });

      const data = await res.json();
      if (data.errors?.length) throw new Error(data.errors[0].message);

      const post = data?.data?.publishPost?.post;
      const url  = post?.url || 'https://hashnode.com';

      articleResults.style.display = 'flex';
      articleResults.insertAdjacentHTML('beforeend', `
        <div class="status-bar success">
          ✅ Published on Hashnode:
          <a href="${esc(url)}" target="_blank" rel="noopener"
            style="color:#7af57a;margin-left:6px;">${escHtml(url)} ↗</a>
        </div>`);

      dispatchDistributionUpdate(container, `hashnode:${url}`);
      setCardStatus(articleCard, 'success', '✅ Hashnode published!');
    } catch (err) {
      setCardStatus(articleCard, 'error', escHtml(err.message));
    } finally {
      hashnodeBtn.disabled = false;
    }
  });

  // ── Card 3: Highlight Clip ─────────────────────────────────────────────────

  const highlightCard = container.querySelector('#dist-highlight-card');
  const generateHlBtn = container.querySelector('#highlight-generate-btn');

  function setHlStep(n) {
    for (let i = 1; i <= 4; i++) {
      const el  = container.querySelector(`#hl-step-${i}`);
      const dot = el?.querySelector('.hl-dot');
      if (!el || !dot) continue;
      if (i < n) {
        el.style.color       = '#16a34a';
        dot.style.background = '#16a34a';
      } else if (i === n) {
        el.style.color       = 'var(--accent)';
        dot.style.background = 'var(--accent)';
      } else {
        el.style.color       = 'var(--muted)';
        dot.style.background = 'var(--border)';
      }
    }
  }

  generateHlBtn.addEventListener('click', async () => {
    const { claudeApiKey } = getSettings();
    if (!claudeApiKey) return setCardStatus(highlightCard, 'error', 'Add a Claude API key in Settings first.');
    if (!container._videoData) return;

    const { script, title, ytUrl, tags } = container._videoData;
    if (!script) return setCardStatus(highlightCard, 'error', 'No script found. Re-generate from Tab 2.');

    generateHlBtn.disabled = true;
    setHlStep(1);
    setCardStatus(highlightCard, 'info', '<span class="loader"></span> Analysing script for best 60-second segment…');

    try {
      setHlStep(2);

      const raw = await callClaude(claudeApiKey, {
        system: `You analyze video scripts to find the most viral-worthy 60-second segment for TikTok/Reels.

Choose a segment that:
- Makes a strong standalone point
- Has a surprising stat, insight or revelation
- Starts with a hook that stops scrolling
- Works without needing context from the rest
- Has a natural start and end
- Would make someone want to watch the full video

Return ONLY JSON, no other text:
{
  "start_text": "first 8-10 words of the segment",
  "end_text": "last 8-10 words of the segment",
  "word_count": 150,
  "hook_type": "stat|question|revelation|story",
  "why_viral": "one sentence reason this works",
  "caption_line1": "first line of TikTok caption (max 8 words)",
  "caption_line2": "second line (max 8 words)",
  "caption_line3": "CTA line e.g. Full video in bio",
  "suggested_hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`,
        user: `Find the best 60-second highlight segment from this script about: ${title}\n\n${script.slice(0, 8000)}`,
        maxTokens: 500,
      });

      const segment = parseJSON(raw);

      // Download highlight-input.json for the Node.js script
      const hlInput = {
        video_path:  'final-video.mp4',
        script:      script,
        topic:       title,
        tags:        Array.isArray(tags) ? tags : [],
        youtube_url: ytUrl || '',
      };
      downloadJson(hlInput, 'highlight-input.json');

      // Populate TikTok/Instagram caption panel
      const lines = [segment.caption_line1, segment.caption_line2, segment.caption_line3].filter(Boolean);
      container.querySelector('#hl-caption-lines').innerHTML =
        lines.map(l => `<div>${escHtml(l)}</div>`).join('');
      const hashStr = (segment.suggested_hashtags || []).join(' ');
      container.querySelector('#hl-hashtags').textContent = hashStr;

      // Populate Twitter/X post
      const tweetHashtags = (segment.suggested_hashtags || []).slice(0, 3).join(' ');
      container.querySelector('#hl-tweet').value =
        `${title}\n\n${segment.caption_line1 || ''}\n${segment.caption_line2 || ''}\n\nFull video: ${ytUrl || ''}\n\n${tweetHashtags}`;

      container.querySelector('#highlight-result').style.display = 'block';
      setHlStep(3);
      setCardStatus(highlightCard, 'success',
        `✅ highlight-input.json downloaded — ${escHtml(segment.why_viral || '')} · ` +
        `Move file to project root then run <code>npm run highlight</code>`);

      dispatchDistributionUpdate(container, 'highlight:prepared');
    } catch (err) {
      setCardStatus(highlightCard, 'error', escHtml(err.message));
      setHlStep(1);
    } finally {
      generateHlBtn.disabled = false;
    }
  });

  // Re-generate with a new segment selection
  container.querySelector('#highlight-regen-btn').addEventListener('click', () => {
    container.querySelector('#highlight-result').style.display = 'none';
    generateHlBtn.click();
  });

  // Reload video preview after npm run highlight completes
  container.querySelector('#hl-reload-btn').addEventListener('click', () => {
    const v   = container.querySelector('#hl-video-preview');
    const src = v.querySelector('source');
    src.src   = `highlight.mp4?t=${Date.now()}`;
    v.load();
    setHlStep(4);
  });

  // Copy buttons
  container.querySelector('#copy-hl-cmd-btn').addEventListener('click', () => {
    navigator.clipboard.writeText('npm run highlight');
    const b = container.querySelector('#copy-hl-cmd-btn');
    b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy Command'; }, 1500);
  });

  container.querySelector('#copy-hl-caption-btn').addEventListener('click', () => {
    const lines  = container.querySelector('#hl-caption-lines').innerText;
    const hashes = container.querySelector('#hl-hashtags').textContent;
    navigator.clipboard.writeText(`${lines}\n\n${hashes}`);
    const b = container.querySelector('#copy-hl-caption-btn');
    b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy All'; }, 1500);
  });

  container.querySelector('#copy-hl-tweet-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(container.querySelector('#hl-tweet').value);
    const b = container.querySelector('#copy-hl-tweet-btn');
    b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy'; }, 1500);
  });
}

// ── History update dispatch ────────────────────────────────────────────────────

function dispatchDistributionUpdate(container, channel) {
  const heygenId = container._videoData?.heygenVideoId || '';
  document.dispatchEvent(new CustomEvent('distribution-update', {
    detail: { heygenVideoId: heygenId, channel },
  }));
}
