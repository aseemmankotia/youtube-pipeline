import { renderTopics } from './components/topics.js';
import { renderScript } from './components/script.js';
import { renderHeyGen } from './components/heygen.js';

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

renderTopics(topicsPanel, onTopicSelect);
renderScript(scriptPanel, () => {});
renderHeyGen(videoPanel);

// ── Auto-pipeline event chain ─────────────────────────────────────────────────

// Step 1 → Step 2: selecting a topic pre-fills the script input
function onTopicSelect(topic) {
  if (scriptPanel._setTopic) scriptPanel._setTopic(topic);
}

// Step 2 → Step 3: script generated → switch to Video tab + auto-start if creds ready
document.addEventListener('send-to-video', (e) => {
  if (videoPanel._setScript) videoPanel._setScript(e.detail?.script);
  switchTab('video');
});
