import { renderTopics }      from './components/topics.js';
import { renderScript }      from './components/script.js';
import { renderElevenLabs }  from './components/elevenlabs.js';

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

// Callback: when a topic is selected in the Topics tab,
// pre-fill the Script Generator and optionally switch to it.
function onTopicSelect(topic) {
  if (scriptPanel._setTopic) scriptPanel._setTopic(topic);
}

renderTopics(topicsPanel, onTopicSelect);
renderScript(scriptPanel, () => {});
renderElevenLabs(voicePanel);

// When "Send to Voice Tab" is clicked from Script Generator,
// switch to the Voice tab automatically.
document.addEventListener('send-to-voice', () => {
  switchTab('voice');
});
