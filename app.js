import { renderTopics }   from './components/topics.js';
import { renderScript }   from './components/script.js';
import { renderHeyGen }   from './components/heygen.js';
import { renderYouTube }  from './components/youtube.js';
import { renderHistory, saveHistoryEntry, updateHistoryByHeygenId } from './components/history.js';
import { renderSettings, getSettings } from './components/settings.js';
import { logToSheets }        from './components/sheets.js';
import { sendEmailSummary }   from './components/email.js';
import {
  getTodayCost, getTodayEntries, getTodaySavings,
  getThisWeekCost, getAllTimeCost, getAllTimeSavings,
  groupByAction, resetToday, fmtCost,
} from './components/usage.js';

// ── Tab routing ──────────────────────────────────────────────────────────────

const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchTab(tabName) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Mount components ─────────────────────────────────────────────────────────

const topicsPanel   = document.getElementById('tab-topics');
const scriptPanel   = document.getElementById('tab-script');
const videoPanel    = document.getElementById('tab-video');
const uploadPanel   = document.getElementById('tab-upload');
const historyPanel  = document.getElementById('tab-history');
const settingsPanel = document.getElementById('tab-settings');

renderTopics(topicsPanel, onTopicSelect);
renderScript(scriptPanel);
renderHeyGen(videoPanel);
renderYouTube(uploadPanel);
renderHistory(historyPanel);
renderSettings(settingsPanel);

// ── Settings dot (red = required credentials missing) ────────────────────────

const dot = document.getElementById('settings-dot');

function updateSettingsDot() {
  const s = getSettings();
  const missing = !s.ytClientId || !s.ytClientSecret || !s.ytRefreshToken;
  dot.style.display = missing ? 'block' : 'none';
}

updateSettingsDot();
document.addEventListener('settings-changed', updateSettingsDot);

// ── Auto-pipeline event chain ─────────────────────────────────────────────────

// Step 1 → Step 2: topic selected → pre-fill script input + store meta for render-input
function onTopicSelect(topic, niche) {
  if (scriptPanel._setTopic)       scriptPanel._setTopic(topic);
  if (videoPanel._setTopicMeta)    videoPanel._setTopicMeta(topic, niche);
}

// Step 2 → Step 3: script ready → switch to Video tab, auto-start if creds present
document.addEventListener('send-to-video', (e) => {
  if (videoPanel._setScript) videoPanel._setScript(e.detail?.script);
  switchTab('video');
});

// Step 3 complete: save history entry + log to Sheets
document.addEventListener('video-complete', async (e) => {
  const { videoUrl, videoId, script, topic } = e.detail || {};

  // Hand off to upload tab (await so description is generated before we read it)
  if (uploadPanel._setVideoData) await uploadPanel._setVideoData({ videoUrl, script, topic });
  switchTab('upload');

  const description = uploadPanel._generatedDescription || '';

  // Save initial history entry (status: generated)
  saveHistoryEntry({
    heygenVideoId:  videoId || '',
    heygenVideoUrl: videoUrl || '',
    topic:          topic || '',
    scriptExcerpt:  (script || '').slice(0, 500),
    description,
    status:         'generated',
    createdAt:      new Date().toISOString(),
  });

  // Log to Sheets (non-fatal)
  logToSheets({
    topic,
    scriptExcerpt:  (script || '').slice(0, 500),
    heygenVideoUrl: videoUrl || '',
    youtubeUrl:     '',
    status:         'generated',
  });
});

// Step 4 complete: update history, log to Sheets, send email
document.addEventListener('upload-complete', (e) => {
  const { videoId: ytVideoId, ytUrl, youtubeTitle, heygenVideoId, heygenVideoUrl } = e.detail || {};
  const topic = youtubeTitle || '';

  // Update existing history entry to uploaded (preserve description already saved)
  if (heygenVideoId) {
    updateHistoryByHeygenId(heygenVideoId, {
      youtubeUrl:  ytUrl || '',
      status:      'uploaded',
      description: uploadPanel._generatedDescription || '',
    });
  }

  // Log final state to Sheets (non-fatal)
  logToSheets({
    topic,
    scriptExcerpt:  '',
    heygenVideoUrl: heygenVideoUrl || '',
    youtubeUrl:     ytUrl || '',
    status:         'uploaded',
  });

  // Send email summary (non-fatal)
  const settings = getSettings();
  sendEmailSummary({
    topic,
    youtubeUrl:    ytUrl || '',
    scriptExcerpt: '',
    date:          new Date().toLocaleString(),
    settings,
  }).catch(err => console.warn('[Email] Failed to send:', err.message));
});

// ── Usage widget ─────────────────────────────────────────────────────────────

const usageBtn = document.getElementById('usage-widget-btn');

function updateUsageWidget() {
  const cost = getTodayCost();
  usageBtn.textContent = `💰 ${fmtCost(cost)} today`;
  usageBtn.className = 'usage-widget-btn ' +
    (cost < 0.5 ? 'usage-green' : cost < 2 ? 'usage-amber' : 'usage-red');
  if (cost >= 2) usageBtn.title = '⚠️ High API spend today — consider using cached results';
  else usageBtn.title = 'Click to see API cost breakdown';
}

updateUsageWidget();
document.addEventListener('usage-updated', updateUsageWidget);

usageBtn.addEventListener('click', showUsageModal);

const ACTION_LABELS = {
  topic_search:   'Topic search',
  script_gen:     'Script generation',
  script_shorten: 'Make shorter',
  script_expand:  'Make longer',
  slide_preview:  'Slide preview',
};

function showUsageModal() {
  document.querySelector('.usage-modal-overlay')?.remove();

  const todayEntries = getTodayEntries();
  const todayCost    = getTodayCost();
  const todaySavings = getTodaySavings();
  const weekCost     = getThisWeekCost();
  const allTime      = getAllTimeCost();
  const allSavings   = getAllTimeSavings();
  const byAction     = groupByAction(todayEntries);

  const rows = Object.entries(byAction).map(([action, d]) => `
    <tr>
      <td>${ACTION_LABELS[action] || action}</td>
      <td style="text-align:center">${d.calls}</td>
      <td style="text-align:right">${fmtCost(d.cost)}</td>
    </tr>`).join('');

  const overlay = document.createElement('div');
  overlay.className = 'usage-modal-overlay';
  overlay.innerHTML = `
    <div class="usage-modal">
      <div class="usage-modal-header">
        <h3 style="margin:0;">💰 API Cost Monitor</h3>
        <button id="usage-modal-close" class="usage-modal-close">✕</button>
      </div>

      <div class="usage-modal-body">
        <div class="usage-stat-row">
          <span>Today</span><strong>${fmtCost(todayCost)}</strong>
        </div>
        <div class="usage-stat-row">
          <span>This week</span><strong>${fmtCost(weekCost)}</strong>
        </div>
        <div class="usage-stat-row">
          <span>All time</span><strong>${fmtCost(allTime)}</strong>
        </div>
        ${todaySavings > 0 ? `
        <div class="usage-stat-row" style="color:#7af57a;">
          <span>💚 Saved by cache today</span><strong>${fmtCost(todaySavings)}</strong>
        </div>` : ''}
        ${allSavings > 0 ? `
        <div class="usage-stat-row" style="color:#7af57a;font-size:0.8rem;">
          <span>⚡ Total saved by cache</span><strong>${fmtCost(allSavings)}</strong>
        </div>` : ''}

        ${todayEntries.length > 0 ? `
        <table class="usage-table">
          <thead>
            <tr>
              <th>Action</th><th style="text-align:center">Calls</th>
              <th style="text-align:right">Cost</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td><strong>Total today</strong></td>
              <td style="text-align:center"><strong>${todayEntries.length}</strong></td>
              <td style="text-align:right"><strong>${fmtCost(todayCost)}</strong></td>
            </tr>
          </tfoot>
        </table>` : `
        <p style="text-align:center;color:var(--muted);padding:20px 0;font-size:0.88rem;">
          No API calls recorded today.
        </p>`}

        <div style="display:flex;justify-content:space-between;align-items:center;
                    margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
          <span style="font-size:0.75rem;color:var(--muted);">
            Updated ${new Date().toLocaleTimeString()}
          </span>
          <button id="usage-reset-btn" class="btn btn-secondary"
            style="font-size:0.78rem;padding:4px 12px;">
            Reset today's counter
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#usage-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#usage-reset-btn').addEventListener('click', () => {
    resetToday();
    overlay.remove();
  });
}

// ── Test email button (dispatched by settings.js) ─────────────────────────────

// Test email button (dispatched by settings.js)
document.addEventListener('test-email', (e) => {
  const { onResult } = e.detail || {};
  const settings = getSettings();
  sendEmailSummary({
    topic:         'Test Email',
    youtubeUrl:    'https://www.youtube.com/',
    scriptExcerpt: 'This is a test email from your YouTube Pipeline.',
    date:          new Date().toLocaleString(),
    settings,
  })
    .then(() => onResult?.(true, 'Test email sent!'))
    .catch(err => onResult?.(false, err.message));
});
