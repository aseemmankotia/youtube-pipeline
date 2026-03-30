import { renderTopics }     from './components/topics.js';
import { renderScript }     from './components/script.js';
import { renderElevenLabs } from './components/elevenlabs.js';
import { renderHeyGen }     from './components/heygen.js';

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
const voicePanel  = document.getElementById('tab-voice');
const videoPanel  = document.getElementById('tab-video');

renderTopics(topicsPanel, onTopicSelect);
renderScript(scriptPanel, () => {});
renderElevenLabs(voicePanel);
renderHeyGen(videoPanel);

// ── Auto-pipeline event chain ─────────────────────────────────────────────────

// Step 1 → Step 2: selecting a topic pre-fills the script input
function onTopicSelect(topic) {
  if (scriptPanel._setTopic) scriptPanel._setTopic(topic);
}

// Step 2 → Step 3: "Send to Voice Tab" button switches tab + fills script
document.addEventListener('send-to-voice', (e) => {
  if (voicePanel._setScript) voicePanel._setScript(e.detail?.script);
  switchTab('voice');
});

// Step 3 → Step 4: ElevenLabs audio complete → switch to HeyGen tab
// (HeyGen component auto-starts if its API key + avatar ID are already filled)
document.addEventListener('audio-complete', (e) => {
  if (videoPanel._setScript) videoPanel._setScript(e.detail?.script);
  switchTab('video');
});
