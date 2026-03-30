/**
 * ElevenLabs Voice Generation Component
 * Converts a script to audio using the ElevenLabs Text-to-Speech API.
 */

// Popular ElevenLabs voices with their IDs
const PRESET_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Female, Warm)' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Male, Well-rounded)' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Female, Emotional)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Female, Strong)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Male, Deep)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Male, Narration)' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (Male, Raspy)' },
];

const MODELS = [
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2 (best quality)' },
  { id: 'eleven_turbo_v2_5',      name: 'Turbo v2.5 (fast)' },
  { id: 'eleven_monolingual_v1',  name: 'Monolingual v1 (English)' },
];

export function renderElevenLabs(container) {
  container.innerHTML = `
    <div class="card">
      <h2>ElevenLabs Voice Generation</h2>

      <div class="form-row">
        <div class="form-group">
          <label for="el-api-key">ElevenLabs API Key</label>
          <input type="password" id="el-api-key" placeholder="Your ElevenLabs API key…" autocomplete="off" />
        </div>
        <div class="form-group">
          <label for="el-model">Model</label>
          <select id="el-model">
            ${MODELS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="el-voice-preset">Preset Voice</label>
          <select id="el-voice-preset">
            <option value="">— pick a preset —</option>
            ${PRESET_VOICES.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="el-voice-id">
            Custom Voice ID
            <span style="color:var(--muted);font-weight:400"> — overrides preset</span>
          </label>
          <input type="text" id="el-voice-id" placeholder="e.g. 21m00Tcm4TlvDq8ikWAM" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="el-stability">Stability <span id="stability-val">0.50</span></label>
          <input type="range" id="el-stability" min="0" max="1" step="0.05" value="0.50"
            style="width:100%;accent-color:var(--accent);" />
        </div>
        <div class="form-group">
          <label for="el-similarity">Similarity Boost <span id="similarity-val">0.75</span></label>
          <input type="range" id="el-similarity" min="0" max="1" step="0.05" value="0.75"
            style="width:100%;accent-color:var(--accent);" />
        </div>
      </div>

      <div class="form-group">
        <label for="el-script">Script Text</label>
        <textarea id="el-script" rows="8" placeholder="Paste your script here, or use 'Send to Voice Tab' from the Script Generator…"></textarea>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-primary" id="generate-voice-btn">
          <span>Generate Voice</span>
        </button>
        <span id="char-count" style="color:var(--muted);font-size:0.85rem;"></span>
      </div>

      <div id="voice-status"></div>
    </div>

    <div id="audio-result" style="display:none;" class="card">
      <h2>Generated Audio</h2>
      <div class="audio-wrap">
        <p id="audio-meta"></p>
        <audio id="audio-player" controls></audio>
      </div>
      <div class="script-actions" style="margin-top:12px;">
        <a class="btn btn-success" id="download-audio-btn" download="voiceover.mp3">Download MP3</a>
      </div>
    </div>
  `;

  // Sync preset → custom id field
  const presetSel = container.querySelector('#el-voice-preset');
  const voiceIdInp = container.querySelector('#el-voice-id');
  presetSel.addEventListener('change', () => {
    if (presetSel.value) voiceIdInp.value = presetSel.value;
  });

  // Slider display updates
  const stabSlider = container.querySelector('#el-stability');
  const simSlider  = container.querySelector('#el-similarity');
  stabSlider.addEventListener('input', () => {
    container.querySelector('#stability-val').textContent = parseFloat(stabSlider.value).toFixed(2);
  });
  simSlider.addEventListener('input', () => {
    container.querySelector('#similarity-val').textContent = parseFloat(simSlider.value).toFixed(2);
  });

  // Character count
  const scriptTA = container.querySelector('#el-script');
  const charCount = container.querySelector('#char-count');
  const updateCharCount = () => {
    const n = scriptTA.value.length;
    charCount.textContent = `${n.toLocaleString()} characters`;
    charCount.style.color = n > 5000 ? '#f57a7a' : 'var(--muted)';
  };
  scriptTA.addEventListener('input', updateCharCount);

  // Expose setter for app.js auto-pipeline wiring
  container._setScript = (script) => {
    scriptTA.value = script || '';
    updateCharCount();
  };

  // Receive script from Script Generator tab
  document.addEventListener('send-to-voice', (e) => {
    scriptTA.value = e.detail?.script || '';
    updateCharCount();
  });

  container.querySelector('#generate-voice-btn').addEventListener('click', () => {
    generateVoice(container);
  });
}

async function generateVoice(container) {
  const apiKey    = container.querySelector('#el-api-key').value.trim();
  const voiceId   = container.querySelector('#el-voice-id').value.trim()
                 || container.querySelector('#el-voice-preset').value;
  const model     = container.querySelector('#el-model').value;
  const stability = parseFloat(container.querySelector('#el-stability').value);
  const similarity= parseFloat(container.querySelector('#el-similarity').value);
  const script    = container.querySelector('#el-script').value.trim();

  const statusEl  = container.querySelector('#voice-status');
  const resultEl  = container.querySelector('#audio-result');
  const btn       = container.querySelector('#generate-voice-btn');

  statusEl.innerHTML = '';
  resultEl.style.display = 'none';

  if (!apiKey) {
    statusEl.innerHTML = `<div class="status-bar error">Please enter your ElevenLabs API key.</div>`;
    return;
  }
  if (!voiceId) {
    statusEl.innerHTML = `<div class="status-bar error">Please select a preset voice or enter a Voice ID.</div>`;
    return;
  }
  if (!script) {
    statusEl.innerHTML = `<div class="status-bar error">Please paste a script to convert.</div>`;
    return;
  }
  if (script.length > 10000) {
    statusEl.innerHTML = `<div class="status-bar error">Script too long (max 10,000 characters per request). Split into parts.</div>`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Generating Audio…</span>';

  try {
    const audioBlob = await callElevenLabs({ apiKey, voiceId, model, stability, similarity, script });

    const url = URL.createObjectURL(audioBlob);
    const player = container.querySelector('#audio-player');
    const dlBtn  = container.querySelector('#download-audio-btn');

    player.src = url;
    dlBtn.href = url;

    const kb = (audioBlob.size / 1024).toFixed(0);
    container.querySelector('#audio-meta').textContent =
      `Voice: ${getVoiceName(voiceId)} • Model: ${model} • Size: ${kb} KB`;

    resultEl.style.display = 'block';
    player.play().catch(() => {});

    statusEl.innerHTML = `<div class="status-bar success">Audio generated! Auto-starting Step 4…</div>`;

    // Fire event so HeyGen tab can auto-start
    document.dispatchEvent(new CustomEvent('audio-complete', {
      detail: { script, audioUrl: url },
    }));
  } catch (err) {
    statusEl.innerHTML = `<div class="status-bar error">${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Generate Voice</span>';
  }
}

async function callElevenLabs({ apiKey, voiceId, model, stability, similarity, script }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: script,
      model_id: model,
      voice_settings: {
        stability,
        similarity_boost: similarity,
      },
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData?.detail?.message || errData?.detail || res.statusText;
    throw new Error(`ElevenLabs error (${res.status}): ${msg}`);
  }

  return await res.blob();
}

function getVoiceName(id) {
  const preset = PRESET_VOICES.find(v => v.id === id);
  return preset ? preset.name : id.slice(0, 12) + '…';
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
