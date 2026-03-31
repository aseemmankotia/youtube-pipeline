import { renderTopics }  from './components/topics.js';
import { renderScript }  from './components/script.js';
import { renderHeyGen }  from './components/heygen.js';
import { renderYouTube } from './components/youtube.js';

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

const topicsPanel = document.getElementById('tab-topics');
const scriptPanel = document.getElementById('tab-script');
const videoPanel  = document.getElementById('tab-video');
const uploadPanel = document.getElementById('tab-upload');

renderTopics(topicsPanel, onTopicSelect);
renderScript(scriptPanel, () => {});
renderHeyGen(videoPanel);
renderYouTube(uploadPanel);

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

// Step 3 → Step 4: HeyGen video ready → switch to Upload tab, auto-start if creds saved
document.addEventListener('video-complete', (e) => {
  const { videoUrl, script, topic } = e.detail || {};
  if (uploadPanel._setVideoData) uploadPanel._setVideoData({ videoUrl, script, topic });
  switchTab('upload');
});
