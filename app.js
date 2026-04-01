import { renderTopics }   from './components/topics.js';
import { renderScript }   from './components/script.js';
import { renderHeyGen }   from './components/heygen.js';
import { renderYouTube }  from './components/youtube.js';
import { renderHistory, saveHistoryEntry, updateHistoryByHeygenId } from './components/history.js';
import { renderSettings, getSettings } from './components/settings.js';
import { logToSheets }        from './components/sheets.js';
import { sendEmailSummary }   from './components/email.js';

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

// Step 1 → Step 2: topic selected → pre-fill script input
function onTopicSelect(topic) {
  if (scriptPanel._setTopic) scriptPanel._setTopic(topic);
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
