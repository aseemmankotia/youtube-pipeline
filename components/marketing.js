/**
 * marketing.js — Tab "📈 Marketing"
 * Generates thumbnail concepts, A/B titles, SEO keywords,
 * pinned comment options, and upload-time recommendations.
 */

import { getSettings } from './settings.js';
import { trackUsage }  from './usage.js';

// ── Storage keys ───────────────────────────────────────────────────────────────
const K = {
  topic:      'pipeline_current_topic',
  script:     'pipeline_current_script',
  ytUrl:      'pipeline_youtube_url',
  ytId:       'pipeline_youtube_id',
  ytTitle:    'pipeline_youtube_title',
  tags:       'pipeline_current_tags',
  thumbs:     'marketing_thumbnails',
  titles:     'marketing_titles',
  keywords:   'marketing_keywords',
  comments:   'marketing_comments',
  uploadTime: 'marketing_upload_time',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s)     { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function lget(key)  { return localStorage.getItem(key) || ''; }
function lset(key, v) { localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v)); }
function lgetJSON(key) { try { return JSON.parse(lget(key)); } catch { return null; } }

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
    const e = await res.json().catch(()=>({}));
    throw new Error(e?.error?.message || res.statusText);
  }
  const d = await res.json();
  trackUsage('marketing_gen', d.usage?.input_tokens||0, d.usage?.output_tokens||0);
  return (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
}

function parseJSON(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]+?)```/) || text.match(/(\[[\s\S]+\]|\{[\s\S]+\})/);
  if (!m) throw new Error('No JSON found in Claude response.');
  return JSON.parse(m[1]);
}

async function getYTToken() {
  const { ytClientId: cid, ytClientSecret: csec, ytRefreshToken: rtok } = getSettings();
  if (!cid || !csec || !rtok) throw new Error('YouTube credentials not set. Add them in Settings.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: rtok, grant_type: 'refresh_token' }),
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(`YouTube token: ${d.error_description || d.error}`);
  return d.access_token;
}

const TODAY = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// ── Badge helper ───────────────────────────────────────────────────────────────

function setBadge(el, state) {
  if (!el) return;
  const map = {
    ready:      { text: '✅ Ready',          color: '#7af57a' },
    generating: { text: '🔄 Generating…',    color: '#f9a825' },
    none:       { text: '⬜ Not generated',   color: 'var(--muted)' },
  };
  const s = map[state] || map.none;
  el.textContent = s.text;
  el.style.color  = s.color;
}

// ── Collapsible toggle ─────────────────────────────────────────────────────────

function wireCollapse(container, sectionId) {
  const hdr     = container.querySelector(`#mkt-${sectionId}-hdr`);
  const body    = container.querySelector(`#mkt-${sectionId}-body`);
  const chevron = container.querySelector(`#mkt-${sectionId}-chevron`);
  if (!hdr || !body) return;
  hdr.style.cursor = 'pointer';
  hdr.addEventListener('click', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    if (chevron) chevron.style.transform = hidden ? '' : 'rotate(-90deg)';
  });
}

// ── YouTube API helpers ────────────────────────────────────────────────────────

async function ytGetSnippet(videoId, token) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const d = await r.json();
  return d.items?.[0]?.snippet || null;
}

async function ytUpdateTitle(videoId, newTitle, token) {
  const snippet = await ytGetSnippet(videoId, token);
  if (!snippet) throw new Error('Could not fetch current video snippet.');
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: videoId, snippet: { ...snippet, title: newTitle } }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e?.error?.message || r.statusText); }
}

async function ytApplySEO(videoId, optimisedTitle, descOpening, allKeywords, token) {
  const snippet = await ytGetSnippet(videoId, token);
  if (!snippet) throw new Error('Could not fetch current video snippet.');
  const newDesc = descOpening + '\n\n' + (snippet.description || '');
  const existTags = snippet.tags || [];
  const newTags = [...new Set([...allKeywords, ...existTags])].slice(0, 500);
  const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: videoId, snippet: { ...snippet, title: optimisedTitle, description: newDesc, tags: newTags } }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e?.error?.message || r.statusText); }
}

async function ytSetThumbnail(videoId, imgPath, token) {
  const imgRes = await fetch(imgPath);
  if (!imgRes.ok) throw new Error(`Thumbnail not found: ${imgPath}. Run "npm run thumbnail" first.`);
  const blob = await imgRes.blob();
  const r = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': blob.type || 'image/png' }, body: blob }
  );
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e?.error?.message || r.statusText); }
}

async function ytPostComment(videoId, commentText, token) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { videoId, topLevelComment: { snippet: { textOriginal: commentText } } } }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e?.error?.message || r.statusText); }
  return r.json();
}

// ── Background style map ───────────────────────────────────────────────────────

const BG_STYLES = {
  dark_gradient:  'linear-gradient(135deg,#0a0e1a 0%,#0d1b2e 40%,#0f2040 100%)',
  light_gradient: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)',
  solid_dark:     '#0a0e1a',
  solid_light:    '#1a237e',
};

// ── Thumbnail concept card ─────────────────────────────────────────────────────

function thumbCardHtml(c, i) {
  const bg = BG_STYLES[c.background_style] || BG_STYLES.dark_gradient;
  const titleFs = c.title_text?.length > 20 ? 22 : c.title_text?.length > 15 ? 26 : c.title_text?.length > 10 ? 30 : 36;
  return `
    <div class="mkt-thumb-slot ${i === 0 ? 'mkt-thumb-selected' : ''}"
      data-idx="${i}" data-path="thumbnails/thumbnail-${i+1}.png"
      style="border:2px solid ${i===0 ? '#7af57a' : 'var(--border)'};border-radius:8px;
             cursor:pointer;overflow:hidden;position:relative;">
      <!-- In-browser concept preview -->
      <div class="mkt-thumb-concept" style="background:${esc(bg)};
           position:relative;padding-top:56.25%;overflow:hidden;">
        <div style="position:absolute;top:50%;right:-10px;transform:translateY(-50%);
             font-size:80px;opacity:0.1;line-height:1;pointer-events:none;">
          ${esc(c.icon_emoji||'🎬')}
        </div>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;
             justify-content:center;padding:10px 12px;">
          <div style="font-size:${titleFs}px;font-weight:900;color:${esc(c.accent_color||'#00d4ff')};
               text-transform:uppercase;line-height:1.05;margin-bottom:4px;">
            ${escHtml(c.title_text||'')}
          </div>
          ${c.subtitle_text ? `<div style="font-size:11px;font-weight:700;
               color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:.04em;">
            ${escHtml(c.subtitle_text)}
          </div>` : ''}
        </div>
        <div style="position:absolute;top:6px;left:8px;font-size:8px;color:rgba(255,255,255,0.35);font-weight:700;">TechNuggets</div>
        <div style="position:absolute;top:4px;right:4px;background:${esc(c.accent_color||'#00d4ff')};
             color:#0a0e1a;font-size:8px;font-weight:900;padding:2px 5px;border-radius:2px;">2026</div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:3px;
             background:linear-gradient(90deg,${esc(c.accent_color||'#00d4ff')},${esc(c.primary_color||'#6c5ce7')});"></div>
        <!-- Actual PNG overlays when available -->
        <img src="thumbnails/thumbnail-${i+1}.png"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;"
          onload="this.style.display='block';this.previousElementSibling?.previousElementSibling?.previousElementSibling?.previousElementSibling?.previousElementSibling?.style && (this.previousElementSibling.previousElementSibling.style.display='none')"
          onerror="this.style.display='none'">
      </div>
      <div style="padding:8px 10px;background:var(--surface2);">
        <div style="font-size:0.72rem;color:var(--muted);">
          <strong style="color:var(--text);">#${i+1}</strong> · ${escHtml(c.emotion||'')} · ${escHtml(c.layout||'')}
        </div>
        <div style="font-size:0.72rem;color:#7ab8f5;margin-top:3px;line-height:1.4;">
          💡 ${escHtml(c.hook_angle||'')}
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary mkt-thumb-set-btn"
            data-idx="${i}" style="font-size:0.72rem;padding:3px 8px;">
            📤 Set as Thumbnail
          </button>
          <a href="thumbnails/thumbnail-${i+1}.png" download="thumbnail-${i+1}.png"
            class="btn btn-secondary" style="font-size:0.72rem;padding:3px 8px;text-decoration:none;">
            ⬇ Download
          </a>
        </div>
      </div>
    </div>`;
}

// ── Title card ─────────────────────────────────────────────────────────────────

function titleCardHtml(t, i) {
  const borderColor = t.ctr_prediction === 'high' ? '#155a15' : t.ctr_prediction === 'medium' ? '#5a4a05' : 'var(--border)';
  const badge       = t.ctr_prediction === 'high' ? '🏆 HIGH CTR' : t.ctr_prediction === 'medium' ? '📊 MEDIUM CTR' : '📉 LOW CTR';
  const badgeColor  = t.ctr_prediction === 'high' ? '#7af57a' : t.ctr_prediction === 'medium' ? '#f9a825' : 'var(--muted)';
  return `
    <div style="border:1px solid ${borderColor};border-radius:8px;padding:14px;margin-bottom:10px;">
      <div style="font-size:0.72rem;font-weight:700;color:${badgeColor};margin-bottom:6px;">${badge}</div>
      <div style="font-size:0.92rem;font-weight:600;color:var(--text);margin-bottom:8px;">
        "${escHtml(t.title||'')}"
      </div>
      <div style="font-size:0.76rem;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px;">
        <span>Formula: ${escHtml(t.formula||'')}</span>
        <span>${t.char_count||0} chars</span>
        <span>Best for: ${escHtml(t.best_for||'')}</span>
      </div>
      <div style="font-size:0.76rem;color:#7ab8f5;margin-bottom:10px;">
        Why: ${escHtml(t.ctr_reasoning||'')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary mkt-title-copy-btn"
          data-title="${esc(t.title||'')}" style="font-size:0.76rem;padding:3px 10px;">
          📋 Copy
        </button>
        <button class="btn btn-secondary mkt-title-set-btn"
          data-title="${esc(t.title||'')}" style="font-size:0.76rem;padding:3px 10px;">
          📤 Set as Title
        </button>
      </div>
    </div>`;
}

// ── Comment card ───────────────────────────────────────────────────────────────

function commentCardHtml(c, i) {
  const replyBadge = c.expected_replies === 'high' ? '💬 High replies expected' : c.expected_replies === 'medium' ? '💬 Medium replies' : '💬 Low replies';
  const typeIcon   = { question:'❓', poll:'📊', resource:'🔗', challenge:'🎯', insight:'💡' }[c.type] || '💬';
  return `
    <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;">
      <div style="font-size:0.72rem;font-weight:700;color:#7ab8f5;margin-bottom:8px;">
        ${typeIcon} ${(c.type||'').toUpperCase()} &nbsp;·&nbsp; ${replyBadge}
      </div>
      <div style="background:var(--surface);border-radius:6px;padding:10px 12px;margin-bottom:8px;
           font-size:0.86rem;line-height:1.6;white-space:pre-wrap;color:var(--text);">
${escHtml(c.comment||'')}
      </div>
      <div style="font-size:0.76rem;color:var(--muted);margin-bottom:10px;">
        Why effective: ${escHtml(c.why_effective||'')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary mkt-comment-copy-btn"
          data-comment="${esc(c.comment||'')}" style="font-size:0.76rem;padding:3px 10px;">
          📋 Copy
        </button>
        <button class="btn btn-secondary mkt-comment-post-btn"
          data-comment="${esc(c.comment||'')}" style="font-size:0.76rem;padding:3px 10px;">
          📤 Post as Pinned Comment
        </button>
      </div>
    </div>`;
}

// ── Summary content ────────────────────────────────────────────────────────────

function buildSummaryHtml(topic, thumbs, titles, kw, comments, time) {
  const tCount = Array.isArray(thumbs)   ? thumbs.length   : 0;
  const tiCount = Array.isArray(titles)  ? titles.length   : 0;
  const kwCount = kw ? [
    ...(kw.secondary_keywords||[]),
    ...(kw.long_tail_keywords||[]),
    ...(kw.google_seo_bonus||[]),
  ].length : 0;
  const coCount = Array.isArray(comments) ? comments.length : 0;

  const bestThumb   = thumbs?.[0]?.hook_angle || '—';
  const bestTitle   = titles?.find(t => t.ctr_prediction === 'high')?.title || titles?.[0]?.title || '—';
  const longTail    = kw?.long_tail_keywords?.[0]?.keyword || '—';
  const bestComment = comments?.find(c => c.expected_replies === 'high')?.type || '—';

  return `
    <div style="font-size:0.9rem;color:var(--muted);margin-bottom:12px;">
      ${escHtml(topic || 'No video yet — upload a video to generate marketing assets')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      ${[
        ['🖼️ Thumbnails', tCount,  'generated', 'mkt-thumb-hdr'],
        ['📝 Titles',     tiCount, 'variations', 'mkt-title-hdr'],
        ['🔍 Keywords',   kwCount, 'identified', 'mkt-seo-hdr'],
        ['💬 Comments',   coCount, 'options',    'mkt-comment-hdr'],
      ].map(([label, n, unit, targetId]) => `
        <div style="background:var(--surface2);border:1px solid var(--border);
             border-radius:6px;padding:10px 12px;display:flex;align-items:center;
             justify-content:space-between;gap:8px;">
          <span style="font-size:0.83rem;">${label}: <strong style="color:${n>0?'#7af57a':'var(--muted)'};">${n} ${unit}</strong></span>
          ${n > 0 ? `<button class="btn btn-secondary mkt-view-btn" data-target="${targetId}"
            style="font-size:0.72rem;padding:2px 8px;">View</button>` : ''}
        </div>`
      ).join('')}
    </div>
    ${(tCount + tiCount + kwCount + coCount) > 0 ? `
    <div style="background:#0d2a0d;border:1px solid #155a15;border-radius:6px;padding:12px 14px;">
      <div style="font-size:0.82rem;font-weight:600;color:#7af57a;margin-bottom:8px;">Recommended actions:</div>
      <div style="font-size:0.8rem;color:#a8e6a8;line-height:2;">
        ${tCount  > 0 ? `✅ Use thumbnail #1 — ${escHtml(bestThumb.slice(0,60))}<br>` : ''}
        ${tiCount > 0 ? `✅ Start with: "${escHtml(bestTitle.slice(0,60))}"<br>` : ''}
        ${kwCount > 0 ? `✅ Target long-tail: "${escHtml(longTail)}"<br>` : ''}
        ${coCount > 0 ? `✅ Post a ${escHtml(bestComment)} comment for engagement<br>` : ''}
        ⏰ Check title CTR after 48 hours and A/B test
      </div>
    </div>` : ''}`;
}

// ── Main render ────────────────────────────────────────────────────────────────

export function renderMarketing(container) {

  container.innerHTML = `
    <!-- Waiting state -->
    <div id="mkt-waiting" class="card" style="text-align:center;padding:48px 24px;">
      <p style="font-size:2rem;margin-bottom:16px;">📈</p>
      <h2 style="margin-bottom:8px;">Marketing Assets</h2>
      <p style="color:var(--muted);font-size:0.95rem;">
        Upload a video in <strong>Tab 4</strong> to auto-populate, or if you've already uploaded,
        your data is stored and will appear here.
      </p>
    </div>

    <!-- Main content (shown when video data exists) -->
    <div id="mkt-main" style="display:none;">

      <!-- Summary card -->
      <div class="card" id="mkt-summary-card">
        <h2 style="margin-bottom:12px;">📈 Marketing Assets for:</h2>
        <div id="mkt-summary-content">
          <p style="color:var(--muted);font-size:0.9rem;">Generate assets below to see recommendations.</p>
        </div>
      </div>

      <!-- Generate All button -->
      <div style="margin-bottom:20px;">
        <button class="btn btn-primary" id="mkt-gen-all-btn"
          style="font-size:0.95rem;padding:12px 24px;">
          🚀 Generate All Marketing Assets
        </button>
        <div class="dist-card-status status-bar" id="mkt-gen-all-status" style="display:none;margin-top:12px;"></div>
      </div>

      <!-- ── Section 1: Thumbnails ───────────────────────────────────────────── -->
      <div class="card">
        <div id="mkt-thumb-hdr" style="display:flex;align-items:center;justify-content:space-between;
             margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:12px;">
            <h2 style="margin:0;">🖼️ Thumbnail Generator</h2>
            <span id="mkt-thumb-badge" style="font-size:0.76rem;color:var(--muted);">⬜ Not generated</span>
          </div>
          <span id="mkt-thumb-chevron" style="font-size:0.8rem;color:var(--muted);transition:transform .2s;cursor:pointer;">▼</span>
        </div>
        <div id="mkt-thumb-body">
          <p style="font-size:0.84rem;color:var(--muted);margin-bottom:14px;">
            Claude generates 5 thumbnail concepts. Run
            <code style="font-size:0.82rem;">npm run thumbnail</code>
            to render actual PNG files at 1280×720.
          </p>
          <button class="btn btn-secondary" id="mkt-thumb-gen-btn">🤖 Generate Thumbnail Concepts</button>
          <div id="mkt-thumb-status" class="status-bar" style="display:none;margin-top:12px;"></div>

          <div id="mkt-thumb-result" style="display:none;margin-top:16px;">
            <!-- Terminal command -->
            <div style="background:#0d1f2e;border:1px solid #1e4a7a;border-radius:var(--radius);
                 padding:12px 14px;margin-bottom:14px;">
              <p style="font-size:0.8rem;color:#7ab8f5;margin-bottom:6px;font-weight:600;">
                ▶ Render actual PNG thumbnails:
              </p>
              <code style="font-size:0.83rem;color:#e8e8e8;">npm run thumbnail</code>
              <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <button class="btn btn-secondary" id="mkt-thumb-copy-cmd-btn"
                  style="font-size:0.76rem;padding:3px 10px;">Copy Command</button>
                <button class="btn btn-secondary" id="mkt-thumb-refresh-btn"
                  style="font-size:0.76rem;padding:3px 10px;">🔄 Refresh Previews</button>
                <button class="btn btn-secondary" id="mkt-thumb-dl-input-btn"
                  style="font-size:0.76rem;padding:3px 10px;">⬇ Download thumbnail-input.json</button>
              </div>
            </div>
            <!-- 5-thumbnail grid -->
            <div id="mkt-thumb-grid"
              style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;"></div>
          </div>
        </div>
      </div>

      <!-- ── Section 2: Title A/B Testing ──────────────────────────────────── -->
      <div class="card">
        <div id="mkt-title-hdr" style="display:flex;align-items:center;justify-content:space-between;
             margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:12px;">
            <h2 style="margin:0;">📝 Title A/B Testing</h2>
            <span id="mkt-title-badge" style="font-size:0.76rem;color:var(--muted);">⬜ Not generated</span>
          </div>
          <span id="mkt-title-chevron" style="font-size:0.8rem;color:var(--muted);transition:transform .2s;cursor:pointer;">▼</span>
        </div>
        <div id="mkt-title-body">
          <button class="btn btn-secondary" id="mkt-title-gen-btn">🤖 Generate 5 Title Variations</button>
          <div id="mkt-title-status" class="status-bar" style="display:none;margin-top:12px;"></div>
          <div id="mkt-title-result" style="display:none;margin-top:16px;">
            <div style="background:#1a2a3a;border:1px solid #1e4a7a;border-radius:var(--radius);
                 padding:10px 14px;margin-bottom:14px;font-size:0.8rem;color:#7ab8f5;">
              ⚠️ Test each title for at least 48 hours in YouTube Studio before changing again.
              Use YouTube Analytics → Impressions CTR to compare.
            </div>
            <div id="mkt-title-cards"></div>
          </div>
        </div>
      </div>

      <!-- ── Section 3: SEO Keywords ────────────────────────────────────────── -->
      <div class="card">
        <div id="mkt-seo-hdr" style="display:flex;align-items:center;justify-content:space-between;
             margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:12px;">
            <h2 style="margin:0;">🔍 SEO Keywords</h2>
            <span id="mkt-seo-badge" style="font-size:0.76rem;color:var(--muted);">⬜ Not generated</span>
          </div>
          <span id="mkt-seo-chevron" style="font-size:0.8rem;color:var(--muted);transition:transform .2s;cursor:pointer;">▼</span>
        </div>
        <div id="mkt-seo-body">
          <button class="btn btn-secondary" id="mkt-seo-gen-btn">🤖 Research SEO Keywords</button>
          <div id="mkt-seo-status" class="status-bar" style="display:none;margin-top:12px;"></div>
          <div id="mkt-seo-result" style="display:none;margin-top:16px;"></div>
        </div>
      </div>

      <!-- ── Section 4: Pinned Comment ──────────────────────────────────────── -->
      <div class="card">
        <div id="mkt-comment-hdr" style="display:flex;align-items:center;justify-content:space-between;
             margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:12px;">
            <h2 style="margin:0;">💬 Pinned Comment</h2>
            <span id="mkt-comment-badge" style="font-size:0.76rem;color:var(--muted);">⬜ Not generated</span>
          </div>
          <span id="mkt-comment-chevron" style="font-size:0.8rem;color:var(--muted);transition:transform .2s;cursor:pointer;">▼</span>
        </div>
        <div id="mkt-comment-body">
          <button class="btn btn-secondary" id="mkt-comment-gen-btn">🤖 Generate Comment Options</button>
          <div id="mkt-comment-status" class="status-bar" style="display:none;margin-top:12px;"></div>
          <div id="mkt-comment-result" style="display:none;margin-top:16px;">
            <div style="background:#1a2a0a;border:1px solid #2a5a15;border-radius:var(--radius);
                 padding:10px 14px;margin-bottom:14px;font-size:0.8rem;color:#a8e6a8;">
              ℹ️ After posting, go to YouTube Studio → Comments to manually pin the comment.
              The YouTube API does not support automated pinning for regular videos.
            </div>
            <div id="mkt-comment-cards"></div>
          </div>
        </div>
      </div>

      <!-- ── Section 5: Upload Time Optimizer ──────────────────────────────── -->
      <div class="card">
        <div id="mkt-time-hdr" style="display:flex;align-items:center;justify-content:space-between;
             margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:12px;">
            <h2 style="margin:0;">⏰ Upload Time Optimizer</h2>
            <span id="mkt-time-badge" style="font-size:0.76rem;color:var(--muted);">⬜ Not generated</span>
          </div>
          <span id="mkt-time-chevron" style="font-size:0.8rem;color:var(--muted);transition:transform .2s;cursor:pointer;">▼</span>
        </div>
        <div id="mkt-time-body">
          <p style="font-size:0.84rem;color:var(--muted);margin-bottom:14px;">
            Best day and time to publish this video based on tech content performance data.
          </p>
          <button class="btn btn-secondary" id="mkt-time-gen-btn">⏰ Get Best Publish Time</button>
          <div id="mkt-time-status" class="status-bar" style="display:none;margin-top:12px;"></div>
          <div id="mkt-time-result" style="display:none;margin-top:16px;"></div>
        </div>
      </div>

    </div><!-- /#mkt-main -->
  `;

  // ── State ──────────────────────────────────────────────────────────────────

  let _topic  = '';
  let _script = '';
  let _ytId   = '';
  let _ytUrl  = '';
  let _tags   = [];

  // ── Helpers to update UI from state ───────────────────────────────────────

  function showMain() {
    container.querySelector('#mkt-waiting').style.display = 'none';
    container.querySelector('#mkt-main').style.display    = '';
  }

  function refreshSummary() {
    container.querySelector('#mkt-summary-content').innerHTML = buildSummaryHtml(
      _topic,
      lgetJSON(K.thumbs),
      lgetJSON(K.titles),
      lgetJSON(K.keywords),
      lgetJSON(K.comments),
      lgetJSON(K.uploadTime),
    );
    // Wire "View" buttons
    container.querySelectorAll('.mkt-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = container.querySelector(`#${btn.dataset.target}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function setStatus(sectionEl, type, html) {
    if (!sectionEl) return;
    sectionEl.className = `status-bar ${type}`;
    sectionEl.style.display = 'flex';
    sectionEl.innerHTML = html;
  }

  function clearStatus(sectionEl) {
    if (!sectionEl) return;
    sectionEl.style.display = 'none';
    sectionEl.innerHTML = '';
  }

  // ── Collapsible sections ──────────────────────────────────────────────────

  ['thumb', 'title', 'seo', 'comment', 'time'].forEach(id => {
    const hdr = container.querySelector(`#mkt-${id}-hdr`);
    const body = container.querySelector(`#mkt-${id}-body`);
    const chevron = container.querySelector(`#mkt-${id}-chevron`);
    if (!hdr || !body) return;
    hdr.addEventListener('click', () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      if (chevron) chevron.style.transform = hidden ? '' : 'rotate(-90deg)';
    });
  });

  // ── Load stored data on mount ─────────────────────────────────────────────

  function loadStored() {
    _topic  = lget(K.topic);
    _script = lget(K.script);
    _ytId   = lget(K.ytId);
    _ytUrl  = lget(K.ytUrl);
    _tags   = lgetJSON(K.tags) || [];

    if (_topic || _script) {
      showMain();
      refreshSummary();

      // Restore previous results if available
      const thumbs    = lgetJSON(K.thumbs);
      const titles    = lgetJSON(K.titles);
      const keywords  = lgetJSON(K.keywords);
      const comments  = lgetJSON(K.comments);
      const uploadTm  = lgetJSON(K.uploadTime);

      if (thumbs)   { renderThumbnailResult(thumbs);  setBadge(container.querySelector('#mkt-thumb-badge'),   'ready'); }
      if (titles)   { renderTitleResult(titles);       setBadge(container.querySelector('#mkt-title-badge'),   'ready'); }
      if (keywords) { renderSEOResult(keywords);       setBadge(container.querySelector('#mkt-seo-badge'),     'ready'); }
      if (comments) { renderCommentResult(comments);   setBadge(container.querySelector('#mkt-comment-badge'),'ready'); }
      if (uploadTm) { renderTimeResult(uploadTm);      setBadge(container.querySelector('#mkt-time-badge'),   'ready'); }
    }
  }

  loadStored();

  // ── _setVideoData (called from app.js on upload-complete) ─────────────────

  container._setVideoData = ({ topic, script, ytUrl, ytVideoId, tags, ytTitle } = {}) => {
    if (topic)      { _topic  = topic;   lset(K.topic,   topic); }
    if (script)     { _script = script;  lset(K.script,  script); }
    if (ytUrl)      { _ytUrl  = ytUrl;   lset(K.ytUrl,   ytUrl); }
    if (ytVideoId)  { _ytId   = ytVideoId; lset(K.ytId,  ytVideoId); }
    if (ytTitle)    { lset(K.ytTitle,   ytTitle); }
    if (tags?.length) { _tags = tags;    lset(K.tags, JSON.stringify(tags)); }
    showMain();
    refreshSummary();
  };

  // ── Generate All ───────────────────────────────────────────────────────────

  const genAllBtn = container.querySelector('#mkt-gen-all-btn');
  const genAllStatus = container.querySelector('#mkt-gen-all-status');

  genAllBtn.addEventListener('click', async () => {
    const { claudeApiKey } = getSettings();
    if (!claudeApiKey) {
      setStatus(genAllStatus, 'error', 'Add a Claude API key in Settings first.');
      return;
    }
    if (!_topic && !_script) {
      setStatus(genAllStatus, 'error', 'No video data found. Upload a video first.');
      return;
    }
    genAllBtn.disabled = true;
    setStatus(genAllStatus, 'info', '<span class="loader"></span> Generating all 4 sections sequentially…');
    try {
      await runGenerateThumbnails();
      setStatus(genAllStatus, 'info', '<span class="loader"></span> [1/4] Thumbnails ✅ — generating titles…');
      await runGenerateTitles();
      setStatus(genAllStatus, 'info', '<span class="loader"></span> [2/4] Titles ✅ — researching SEO…');
      await runGenerateSEO();
      setStatus(genAllStatus, 'info', '<span class="loader"></span> [3/4] SEO ✅ — generating comments…');
      await runGenerateComments();
      setStatus(genAllStatus, 'info', '<span class="loader"></span> [4/4] Comments ✅ — getting upload time…');
      await runGenerateTime();
      setStatus(genAllStatus, 'success', '✅ All marketing assets generated!');
      refreshSummary();
    } catch (err) {
      setStatus(genAllStatus, 'error', escHtml(err.message));
    } finally {
      genAllBtn.disabled = false;
    }
  });

  // ── Section 1: Thumbnails ──────────────────────────────────────────────────

  function renderThumbnailResult(thumbs) {
    const grid = container.querySelector('#mkt-thumb-grid');
    if (!grid) return;
    grid.innerHTML = thumbs.map((c, i) => thumbCardHtml(c, i)).join('');
    container.querySelector('#mkt-thumb-result').style.display = '';

    // Wire thumbnail selection
    container.querySelectorAll('.mkt-thumb-slot').forEach(slot => {
      slot.addEventListener('click', e => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        container.querySelectorAll('.mkt-thumb-slot').forEach(s => {
          s.style.borderColor = 'var(--border)';
          s.classList.remove('mkt-thumb-selected');
        });
        slot.style.borderColor = '#7af57a';
        slot.classList.add('mkt-thumb-selected');
      });
    });

    // Wire "Set as Thumbnail" buttons
    container.querySelectorAll('.mkt-thumb-set-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const videoId = _ytId || lget(K.ytId);
        if (!videoId) { alert('No YouTube video ID found. Upload a video first.'); return; }
        const idx  = parseInt(btn.dataset.idx);
        const path = `thumbnails/thumbnail-${idx + 1}.png`;
        btn.disabled = true;
        btn.textContent = 'Uploading…';
        try {
          const token = await getYTToken();
          await ytSetThumbnail(videoId, path, token);
          btn.textContent = '✅ Set!';
          setTimeout(() => { btn.textContent = '📤 Set as Thumbnail'; btn.disabled = false; }, 2000);
        } catch (err) {
          alert(err.message);
          btn.textContent = '📤 Set as Thumbnail';
          btn.disabled = false;
        }
      });
    });
  }

  async function runGenerateThumbnails() {
    const { claudeApiKey } = getSettings();
    const thumbBadge  = container.querySelector('#mkt-thumb-badge');
    const thumbStatus = container.querySelector('#mkt-thumb-status');
    const thumbGenBtn = container.querySelector('#mkt-thumb-gen-btn');
    setBadge(thumbBadge, 'generating');
    setStatus(thumbStatus, 'info', '<span class="loader"></span> Generating thumbnail concepts…');
    if (thumbGenBtn) thumbGenBtn.disabled = true;

    const topic  = _topic  || lget(K.topic);
    const script = _script || lget(K.script);

    const raw = await callClaude(claudeApiKey, {
      system: `You are an expert YouTube thumbnail designer specialising in tech content. You know what drives clicks. Today is ${TODAY}.

Rules for great thumbnails:
- Maximum 4 words of text
- High contrast colors
- Clear single focal point
- Conveys curiosity, urgency or value
- Works at small size (mobile)
- Avoid: cluttered layouts, small text, boring colors`,
      user: `Generate 5 thumbnail concepts for this video:
Topic: ${topic}
Script excerpt: ${script.substring(0, 500)}

Return ONLY JSON array, no other text:
[{
  "title_text": "3-4 word bold text overlay",
  "subtitle_text": "optional 2-3 word subtitle or empty string",
  "background_style": "dark_gradient|light_gradient|solid_dark|solid_light",
  "primary_color": "#hexcode matching TechNuggets brand",
  "accent_color": "#hexcode for contrast",
  "icon_emoji": "single relevant emoji",
  "layout": "text_left|text_right|text_bottom|text_top|centered",
  "emotion": "surprise|curiosity|urgency|value|fear",
  "hook_angle": "why this concept drives clicks"
}]`,
      maxTokens: 1000,
    });

    const thumbs = parseJSON(raw);
    lset(K.thumbs, thumbs);
    renderThumbnailResult(thumbs);
    setBadge(thumbBadge, 'ready');
    clearStatus(thumbStatus);
    if (thumbGenBtn) { thumbGenBtn.textContent = '🔄 Re-generate'; thumbGenBtn.disabled = false; }
    refreshSummary();
  }

  container.querySelector('#mkt-thumb-gen-btn').addEventListener('click', async () => {
    const { claudeApiKey } = getSettings();
    if (!claudeApiKey) { setStatus(container.querySelector('#mkt-thumb-status'), 'error', 'Add API key in Settings.'); return; }
    try { await runGenerateThumbnails(); }
    catch (err) {
      setBadge(container.querySelector('#mkt-thumb-badge'), 'none');
      setStatus(container.querySelector('#mkt-thumb-status'), 'error', escHtml(err.message));
      container.querySelector('#mkt-thumb-gen-btn').disabled = false;
    }
  });

  container.querySelector('#mkt-thumb-copy-cmd-btn').addEventListener('click', () => {
    navigator.clipboard.writeText('npm run thumbnail');
    const b = container.querySelector('#mkt-thumb-copy-cmd-btn');
    b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy Command'; }, 1500);
  });

  container.querySelector('#mkt-thumb-refresh-btn').addEventListener('click', () => {
    // Reload img elements with cache-busted URLs
    container.querySelectorAll('#mkt-thumb-grid img').forEach(img => {
      const base = img.src.split('?')[0];
      img.src = `${base}?t=${Date.now()}`;
    });
  });

  container.querySelector('#mkt-thumb-dl-input-btn').addEventListener('click', () => {
    const topic  = _topic  || lget(K.topic);
    const script = _script || lget(K.script);
    const tags   = _tags.length ? _tags : (lgetJSON(K.tags) || []);
    const data = { topic, script: script.slice(0, 6000), tags };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'thumbnail-input.json'; a.click();
    URL.revokeObjectURL(url);
  });

  // ── Section 2: Titles ──────────────────────────────────────────────────────

  function renderTitleResult(titles) {
    const cards = container.querySelector('#mkt-title-cards');
    if (!cards) return;
    cards.innerHTML = titles.map((t, i) => titleCardHtml(t, i)).join('');
    container.querySelector('#mkt-title-result').style.display = '';

    container.querySelectorAll('.mkt-title-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.title);
        btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
      });
    });

    container.querySelectorAll('.mkt-title-set-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const videoId = _ytId || lget(K.ytId);
        if (!videoId) { alert('No YouTube video ID found.'); return; }
        btn.disabled = true; btn.textContent = 'Updating…';
        try {
          const token = await getYTToken();
          await ytUpdateTitle(videoId, btn.dataset.title, token);
          btn.textContent = '✅ Updated!';
          setTimeout(() => { btn.textContent = '📤 Set as Title'; btn.disabled = false; }, 2000);
        } catch (err) {
          alert(err.message); btn.textContent = '📤 Set as Title'; btn.disabled = false;
        }
      });
    });
  }

  async function runGenerateTitles() {
    const { claudeApiKey } = getSettings();
    const badge  = container.querySelector('#mkt-title-badge');
    const status = container.querySelector('#mkt-title-status');
    const genBtn = container.querySelector('#mkt-title-gen-btn');
    setBadge(badge, 'generating');
    setStatus(status, 'info', '<span class="loader"></span> Generating title variations…');
    if (genBtn) genBtn.disabled = true;

    const topic  = _topic  || lget(K.topic);
    const script = _script || lget(K.script);

    const raw = await callClaude(claudeApiKey, {
      system: `You are a YouTube growth expert who specialises in writing high-CTR titles for tech content. Today is ${TODAY}.

Title formulas that work for tech YouTube:
1. Curiosity gap: "The [X] Nobody Tells You About [Y]"
2. Numbered: "[N] [Things/Ways/Mistakes] That [Result]"
3. Vs: "[X] vs [Y]: Which Should You Use in 2026?"
4. How-to: "How to [Achieve Result] in [Timeframe]"
5. Warning: "Stop [Doing X]. Do This Instead"
6. Question: "Is [X] Worth Learning in 2026?"
7. Story: "I [Did X] for [Time]. Here's What Happened"

Rules:
- Include the year 2026 when relevant
- 50-60 characters optimal for desktop
- Primary keyword near the start
- No clickbait that misleads
- Match what is actually in the video`,
      user: `Generate 5 title variations for this video. Use your knowledge of trending angles for this topic.

Topic: ${topic}
Script summary: ${script.substring(0, 300)}

Return ONLY JSON array:
[{
  "title": "the full YouTube title",
  "formula": "curiosity_gap|numbered|vs|how_to|warning|question|story",
  "char_count": 55,
  "primary_keyword_position": "start|middle|end",
  "ctr_prediction": "high|medium|low",
  "ctr_reasoning": "one sentence why this CTR prediction",
  "best_for": "new subscribers|returning viewers|search traffic"
}]`,
      maxTokens: 1000,
    });

    const titles = parseJSON(raw);
    lset(K.titles, titles);
    renderTitleResult(titles);
    setBadge(badge, 'ready');
    clearStatus(status);
    if (genBtn) { genBtn.textContent = '🔄 Re-generate'; genBtn.disabled = false; }
    refreshSummary();
  }

  container.querySelector('#mkt-title-gen-btn').addEventListener('click', async () => {
    const { claudeApiKey } = getSettings();
    if (!claudeApiKey) { setStatus(container.querySelector('#mkt-title-status'), 'error', 'Add API key in Settings.'); return; }
    try { await runGenerateTitles(); }
    catch (err) {
      setBadge(container.querySelector('#mkt-title-badge'), 'none');
      setStatus(container.querySelector('#mkt-title-status'), 'error', escHtml(err.message));
      container.querySelector('#mkt-title-gen-btn').disabled = false;
    }
  });

  // ── Section 3: SEO Keywords ────────────────────────────────────────────────

  function renderSEOResult(kw) {
    const result = container.querySelector('#mkt-seo-result');
    if (!result) return;

    const pk = kw.primary_keyword || {};
    const secKws = kw.secondary_keywords || [];
    const ltKws  = kw.long_tail_keywords || [];
    const avoidKws = kw.avoid_keywords || [];
    const googleKws = kw.google_seo_bonus || [];

    const allForApply = [
      pk.keyword,
      ...secKws.map(k=>k.keyword),
      ...ltKws.map(k=>k.keyword),
    ].filter(Boolean);

    result.innerHTML = `
      <!-- Primary Keyword -->
      <div style="margin-bottom:16px;">
        <div style="font-size:0.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;
             letter-spacing:.06em;margin-bottom:8px;">Primary Keyword</div>
        <div style="border:1px solid ${pk.competition==='high'?'#5a1515':pk.competition==='medium'?'#5a4a05':'#155a15'};
             border-radius:8px;padding:12px 14px;background:var(--surface2);">
          <div style="font-size:0.96rem;font-weight:700;margin-bottom:4px;">🎯 ${escHtml(pk.keyword||'')}</div>
          <div style="font-size:0.78rem;color:var(--muted);display:flex;gap:14px;flex-wrap:wrap;">
            <span>Searches: ${escHtml(pk.monthly_searches||'unknown')}/month</span>
            <span>Competition: <strong style="color:${pk.competition==='high'?'#f57a7a':pk.competition==='medium'?'#f9a825':'#7af57a'};">${(pk.competition||'').toUpperCase()}</strong></span>
          </div>
          <div style="font-size:0.78rem;color:${pk.recommended?'#7af57a':'#f9a825'};margin-top:6px;">
            ${pk.recommended ? '✅' : '⚠️'} ${escHtml(pk.reason||'')}
          </div>
        </div>
      </div>

      <!-- Long-tail Keywords (recommended) -->
      ${ltKws.length > 0 ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;
             letter-spacing:.06em;margin-bottom:8px;">Long-tail (Recommended for you)</div>
        ${ltKws.map(k => `
          <div style="border:1px solid #155a15;border-radius:8px;padding:10px 12px;
               background:var(--surface2);margin-bottom:8px;">
            <div style="font-size:0.88rem;font-weight:600;margin-bottom:4px;">✅ ${escHtml(k.keyword||'')}</div>
            <div style="font-size:0.76rem;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
              <span>Searches: ${escHtml(k.monthly_searches||'')}/month</span>
              <span>Competition: <strong style="color:#7af57a;">LOW</strong></span>
            </div>
            <div style="font-size:0.76rem;color:#7ab8f5;">💡 ${escHtml(k.why_good||'')}</div>
          </div>`).join('')}
      </div>` : ''}

      <!-- Secondary Keywords -->
      ${secKws.length > 0 ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;
             letter-spacing:.06em;margin-bottom:8px;">Secondary Keywords</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${secKws.map(k => `
            <div style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;
                 background:var(--surface2);font-size:0.78rem;">
              <div style="font-weight:600;">${escHtml(k.keyword||'')}</div>
              <div style="color:var(--muted);font-size:0.72rem;">
                ${escHtml(k.monthly_searches||'')} · Use in: ${escHtml(k.use_in||'')}
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Avoid -->
      ${avoidKws.length > 0 ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;
             letter-spacing:.06em;margin-bottom:8px;">Avoid (Too Competitive)</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${avoidKws.map(k => `
            <div style="border:1px solid #5a1515;border-radius:6px;padding:6px 10px;
                 background:var(--surface2);font-size:0.78rem;">
              <div style="font-weight:600;color:#f57a7a;">❌ ${escHtml(k.keyword||'')}</div>
              <div style="color:var(--muted);font-size:0.72rem;">${escHtml(k.reason||'')}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Google SEO Bonus -->
      ${googleKws.length > 0 ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;
             letter-spacing:.06em;margin-bottom:8px;">Google Search Bonus</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${googleKws.map(k => `<span style="background:var(--surface2);border:1px solid var(--border);
            border-radius:20px;padding:4px 10px;font-size:0.78rem;">🔍 ${escHtml(k)}</span>`).join('')}
        </div>
      </div>` : ''}

      <!-- Optimised title + description -->
      ${kw.optimised_title ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;
             letter-spacing:.06em;margin-bottom:8px;">SEO-Optimised Title</div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;
             padding:10px 12px;font-size:0.88rem;font-weight:600;margin-bottom:8px;">
          "${escHtml(kw.optimised_title)}"
        </div>
      </div>` : ''}

      ${kw.optimised_description_opening ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:0.76rem;font-weight:700;color:var(--muted);text-transform:uppercase;
             letter-spacing:.06em;margin-bottom:8px;">Description Opening (keyword-rich)</div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;
             padding:10px 12px;font-size:0.84rem;line-height:1.6;">
          ${escHtml(kw.optimised_description_opening)}
        </div>
      </div>` : ''}

      <!-- Apply to video button -->
      <button class="btn btn-secondary" id="mkt-seo-apply-btn" style="margin-top:4px;">
        📤 Apply Optimised Title + Description + Tags to Video
      </button>
      <div id="mkt-seo-apply-status" class="status-bar" style="display:none;margin-top:10px;"></div>
    `;

    result.style.display = '';

    // Wire apply button
    container.querySelector('#mkt-seo-apply-btn')?.addEventListener('click', async () => {
      const videoId = _ytId || lget(K.ytId);
      if (!videoId) { alert('No YouTube video ID found.'); return; }
      const applyBtn = container.querySelector('#mkt-seo-apply-btn');
      const applyStatus = container.querySelector('#mkt-seo-apply-status');
      applyBtn.disabled = true;
      setStatus(applyStatus, 'info', '<span class="loader"></span> Applying SEO to video…');
      try {
        const token = await getYTToken();
        await ytApplySEO(
          videoId,
          kw.optimised_title || '',
          kw.optimised_description_opening || '',
          allForApply,
          token,
        );
        setStatus(applyStatus, 'success', '✅ Title, description, and tags updated on YouTube!');
      } catch (err) {
        setStatus(applyStatus, 'error', escHtml(err.message));
      } finally {
        applyBtn.disabled = false;
      }
    });
  }

  async function runGenerateSEO() {
    const { claudeApiKey } = getSettings();
    const badge  = container.querySelector('#mkt-seo-badge');
    const status = container.querySelector('#mkt-seo-status');
    const genBtn = container.querySelector('#mkt-seo-gen-btn');
    setBadge(badge, 'generating');
    setStatus(status, 'info', '<span class="loader"></span> Researching SEO keywords…');
    if (genBtn) genBtn.disabled = true;

    const topic = _topic || lget(K.topic);
    const tags  = (_tags.length ? _tags : lgetJSON(K.tags) || []).join(', ');

    const raw = await callClaude(claudeApiKey, {
      system: `You are a YouTube SEO specialist. Today is ${TODAY}.
You understand YouTube's search algorithm and how to rank new channels against established ones.`,
      user: `Research SEO keywords for this YouTube video. Use your knowledge of YouTube search trends.

Topic: ${topic}
Tags hint: ${tags}
Channel size: small (under 10k subscribers)

Return ONLY JSON:
{
  "primary_keyword": {
    "keyword": "...",
    "monthly_searches": "estimated range e.g. 10k-50k",
    "competition": "high|medium|low",
    "recommended": true,
    "reason": "why recommend or not for small channel"
  },
  "secondary_keywords": [
    { "keyword": "...", "monthly_searches": "...", "competition": "high|medium|low", "use_in": "title|description|tags|all" }
  ],
  "long_tail_keywords": [
    { "keyword": "...", "monthly_searches": "1k-5k", "competition": "low", "why_good": "easier to rank, specific intent" }
  ],
  "avoid_keywords": [
    { "keyword": "...", "reason": "too competitive for new channel" }
  ],
  "google_seo_bonus": ["keyword that also ranks in Google search"],
  "optimised_title": "title using primary keyword naturally",
  "optimised_description_opening": "first 2 sentences with keywords naturally included"
}`,
      maxTokens: 1500,
    });

    const kw = parseJSON(raw);
    lset(K.keywords, kw);
    renderSEOResult(kw);
    setBadge(badge, 'ready');
    clearStatus(status);
    if (genBtn) { genBtn.textContent = '🔄 Re-research'; genBtn.disabled = false; }
    refreshSummary();
  }

  container.querySelector('#mkt-seo-gen-btn').addEventListener('click', async () => {
    const { claudeApiKey } = getSettings();
    if (!claudeApiKey) { setStatus(container.querySelector('#mkt-seo-status'), 'error', 'Add API key in Settings.'); return; }
    try { await runGenerateSEO(); }
    catch (err) {
      setBadge(container.querySelector('#mkt-seo-badge'), 'none');
      setStatus(container.querySelector('#mkt-seo-status'), 'error', escHtml(err.message));
      container.querySelector('#mkt-seo-gen-btn').disabled = false;
    }
  });

  // ── Section 4: Pinned Comment ──────────────────────────────────────────────

  function renderCommentResult(comments) {
    const cards = container.querySelector('#mkt-comment-cards');
    if (!cards) return;
    cards.innerHTML = comments.map((c, i) => commentCardHtml(c, i)).join('');
    container.querySelector('#mkt-comment-result').style.display = '';

    container.querySelectorAll('.mkt-comment-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.comment);
        btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
      });
    });

    container.querySelectorAll('.mkt-comment-post-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const videoId = _ytId || lget(K.ytId);
        if (!videoId) { alert('No YouTube video ID found.'); return; }
        btn.disabled = true; btn.textContent = 'Posting…';
        try {
          const token = await getYTToken();
          await ytPostComment(videoId, btn.dataset.comment, token);
          btn.textContent = '✅ Posted! Pin it in YouTube Studio.';
          setTimeout(() => { btn.textContent = '📤 Post as Pinned Comment'; btn.disabled = false; }, 4000);
        } catch (err) {
          alert(err.message); btn.textContent = '📤 Post as Pinned Comment'; btn.disabled = false;
        }
      });
    });
  }

  async function runGenerateComments() {
    const { claudeApiKey } = getSettings();
    const badge  = container.querySelector('#mkt-comment-badge');
    const status = container.querySelector('#mkt-comment-status');
    const genBtn = container.querySelector('#mkt-comment-gen-btn');
    setBadge(badge, 'generating');
    setStatus(status, 'info', '<span class="loader"></span> Generating comment options…');
    if (genBtn) genBtn.disabled = true;

    const topic  = _topic  || lget(K.topic);
    const script = _script || lget(K.script);

    const raw = await callClaude(claudeApiKey, {
      system: `You are a YouTube community manager. You know that pinned comments boost engagement and algorithm performance.

Best pinned comment types:
1. Question that sparks debate
2. Quick poll (option A or B?)
3. Resource link + context
4. Challenge/homework for viewers
5. Behind the scenes insight`,
      user: `Generate 5 pinned comment options for this video.

Topic: ${topic}
Script key points: ${script.substring(0, 400)}

Return ONLY JSON array:
[{
  "comment": "the full comment text including emojis",
  "type": "question|poll|resource|challenge|insight",
  "why_effective": "one sentence explanation",
  "expected_replies": "high|medium|low"
}]`,
      maxTokens: 1200,
    });

    const comments = parseJSON(raw);
    lset(K.comments, comments);
    renderCommentResult(comments);
    setBadge(badge, 'ready');
    clearStatus(status);
    if (genBtn) { genBtn.textContent = '🔄 Re-generate'; genBtn.disabled = false; }
    refreshSummary();
  }

  container.querySelector('#mkt-comment-gen-btn').addEventListener('click', async () => {
    const { claudeApiKey } = getSettings();
    if (!claudeApiKey) { setStatus(container.querySelector('#mkt-comment-status'), 'error', 'Add API key in Settings.'); return; }
    try { await runGenerateComments(); }
    catch (err) {
      setBadge(container.querySelector('#mkt-comment-badge'), 'none');
      setStatus(container.querySelector('#mkt-comment-status'), 'error', escHtml(err.message));
      container.querySelector('#mkt-comment-gen-btn').disabled = false;
    }
  });

  // ── Section 5: Upload Time Optimizer ──────────────────────────────────────

  function renderTimeResult(rec) {
    const result = container.querySelector('#mkt-time-result');
    if (!result) return;
    result.innerHTML = `
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:16px;">
        <div style="font-size:1rem;font-weight:700;color:var(--text);margin-bottom:4px;">
          📅 Schedule for: <span style="color:#f9a825;">${escHtml(rec.schedule_for||'')}</span>
        </div>
        <div style="font-size:0.84rem;color:var(--muted);margin-bottom:12px;">
          ${escHtml(rec.best_day||'')} · ${escHtml(rec.best_time||'')}
        </div>
        <div style="font-size:0.84rem;line-height:1.7;color:var(--text);">
          ${escHtml(rec.why||'')}
        </div>
        ${rec.secondary_window ? `
        <div style="margin-top:10px;font-size:0.8rem;color:var(--muted);">
          Also good: ${escHtml(rec.secondary_window)}
        </div>` : ''}
      </div>`;
    result.style.display = '';
  }

  async function runGenerateTime() {
    const { claudeApiKey } = getSettings();
    const badge  = container.querySelector('#mkt-time-badge');
    const status = container.querySelector('#mkt-time-status');
    const genBtn = container.querySelector('#mkt-time-gen-btn');
    setBadge(badge, 'generating');
    setStatus(status, 'info', '<span class="loader"></span> Analysing best publish time…');
    if (genBtn) genBtn.disabled = true;

    const topic = _topic || lget(K.topic);

    const raw = await callClaude(claudeApiKey, {
      system: `You are a YouTube growth strategist who knows YouTube's algorithm timing patterns.
Based on industry data, tech content on YouTube performs best on specific days and times.
Today is ${TODAY}.`,
      user: `Recommend the best time to publish this YouTube video for maximum initial views.

Topic: ${topic}
Channel size: small (under 10k subscribers)
Content type: tech tutorial / educational

Return ONLY JSON:
{
  "best_day": "Tuesday|Wednesday|Thursday|...",
  "best_time": "10:00 AM EST",
  "schedule_for": "Tuesday 10:00 AM EST",
  "secondary_window": "also good: Thursday 2:00 PM EST",
  "why": "2-3 sentences explaining why this timing maximises initial velocity for the algorithm"
}`,
      maxTokens: 400,
    });

    const rec = parseJSON(raw);
    lset(K.uploadTime, rec);
    renderTimeResult(rec);
    setBadge(badge, 'ready');
    clearStatus(status);
    if (genBtn) { genBtn.textContent = '🔄 Re-analyse'; genBtn.disabled = false; }
    refreshSummary();
  }

  container.querySelector('#mkt-time-gen-btn').addEventListener('click', async () => {
    const { claudeApiKey } = getSettings();
    if (!claudeApiKey) { setStatus(container.querySelector('#mkt-time-status'), 'error', 'Add API key in Settings.'); return; }
    try { await runGenerateTime(); }
    catch (err) {
      setBadge(container.querySelector('#mkt-time-badge'), 'none');
      setStatus(container.querySelector('#mkt-time-status'), 'error', escHtml(err.message));
      container.querySelector('#mkt-time-gen-btn').disabled = false;
    }
  });
}
