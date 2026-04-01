/**
 * History Component — Step 5
 * Records every video generation and upload to localStorage.
 * Exported helpers are called by app.js on pipeline events.
 */

const HISTORY_KEY = 'yt_pipeline_history';
const MAX_ENTRIES = 100;

// ── Storage helpers ───────────────────────────────────────────────────────────

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

export function saveHistoryEntry(entry) {
  const history = loadHistory();
  history.unshift(entry);                           // newest first
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_ENTRIES)));
  document.dispatchEvent(new CustomEvent('history-updated'));
}

export function updateHistoryByHeygenId(heygenVideoId, updates) {
  const history = loadHistory();
  const idx = history.findIndex(h => h.heygenVideoId === heygenVideoId);
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...updates };
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    document.dispatchEvent(new CustomEvent('history-updated'));
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderHistory(container) {
  function render() {
    const history = loadHistory();

    if (history.length === 0) {
      container.innerHTML = `
        <div class="card">
          <h2>History</h2>
          <p style="color:var(--muted);text-align:center;padding:48px 0;font-size:0.95rem;">
            No videos yet — complete the pipeline to build your history.
          </p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="margin:0;">
            History
            <span style="color:var(--muted);font-weight:400;font-size:0.88rem;margin-left:8px;">
              ${history.length} video${history.length !== 1 ? 's' : ''}
            </span>
          </h2>
          <button class="btn btn-secondary" id="clear-history-btn"
            style="font-size:0.82rem;padding:6px 14px;">Clear All</button>
        </div>
        <div class="history-grid">
          ${history.map(renderCard).join('')}
        </div>
      </div>
    `;

    container.querySelector('#clear-history-btn').addEventListener('click', () => {
      if (confirm('Clear all history? This cannot be undone.')) {
        localStorage.removeItem(HISTORY_KEY);
        render();
      }
    });
  }

  render();
  document.addEventListener('history-updated', render);
}

function renderCard(entry) {
  const date = new Date(entry.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const badgeClass = { generated: 'badge-blue', uploaded: 'badge-green', failed: 'badge-red' }[entry.status] || 'badge-blue';
  const badgeLabel = { generated: 'Generated', uploaded: 'Uploaded',  failed: 'Failed' }[entry.status] || entry.status;

  const videoBtn = entry.heygenVideoUrl
    ? `<a href="${entry.heygenVideoUrl}" target="_blank" rel="noopener" class="btn btn-secondary history-link">Watch Video</a>`
    : '';
  const ytBtn = entry.youtubeUrl
    ? `<a href="${entry.youtubeUrl}" target="_blank" rel="noopener" class="btn btn-success history-link">View on YouTube</a>`
    : '';

  return `
    <div class="history-card">
      <div class="history-card-top">
        <span class="history-topic">${escHtml(entry.topic || 'Untitled')}</span>
        <span class="history-badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="history-date">${date}</div>
      ${entry.scriptExcerpt
        ? `<div class="history-excerpt">${escHtml(entry.scriptExcerpt.slice(0, 200))}${entry.scriptExcerpt.length > 200 ? '…' : ''}</div>`
        : ''}
      ${videoBtn || ytBtn ? `<div class="history-actions">${videoBtn}${ytBtn}</div>` : ''}
    </div>
  `;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
