/**
 * Settings Component — manages all API credentials in one place.
 * Credentials are persisted to localStorage and auto-saved on every keystroke (debounced).
 * All other components call getSettings() to read credentials — no credential fields on pipeline tabs.
 */

const SETTINGS_KEY = 'yt_pipeline_settings';

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch { return {}; }
}

function saveSettings(data) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  document.dispatchEvent(new CustomEvent('settings-changed', { detail: data }));
}

export function renderSettings(container) {
  const s = getSettings();

  container.innerHTML = `
    <div class="card">
      <h2>Script Generation</h2>
      <div class="form-group" data-field="claudeApiKey">
        <label for="sg-claude-key">
          Anthropic API Key
          <span style="color:var(--muted);font-weight:400"> — optional, enables AI-generated scripts</span>
        </label>
        <input type="password" id="sg-claude-key"
          placeholder="sk-ant-…" autocomplete="off"
          value="${esc(s.claudeApiKey)}" />
      </div>
    </div>

    <div class="card">
      <h2>HeyGen Video Generation</h2>
      <div class="form-row">
        <div class="form-group" data-field="heygenApiKey">
          <label for="sg-hg-apikey">HeyGen API Key</label>
          <input type="password" id="sg-hg-apikey"
            placeholder="sk_V2_…" autocomplete="off"
            value="${esc(s.heygenApiKey)}" />
        </div>
        <div class="form-group" data-field="heygenAvatarId">
          <label for="sg-hg-avatar">Avatar ID</label>
          <input type="text" id="sg-hg-avatar"
            placeholder="e.g. josh_lite3_20230714"
            value="${esc(s.heygenAvatarId)}" />
        </div>
      </div>
      <div class="form-group" data-field="heygenVoiceId">
        <label for="sg-hg-voice">Voice ID</label>
        <input type="text" id="sg-hg-voice"
          placeholder="e.g. 3ec6fddde15a4f5bacf2c1557ecea26f"
          value="${esc(s.heygenVoiceId)}" />
      </div>
    </div>

    <div class="card">
      <h2>YouTube Upload</h2>
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:16px;">
        Stored in <code>localStorage</code> only — never sent anywhere except Google's OAuth endpoint.
      </p>
      <div class="form-row">
        <div class="form-group" data-field="ytClientId">
          <label for="sg-yt-clientid">Client ID</label>
          <input type="text" id="sg-yt-clientid"
            placeholder="386017…apps.googleusercontent.com"
            value="${esc(s.ytClientId)}" />
        </div>
        <div class="form-group" data-field="ytClientSecret">
          <label for="sg-yt-secret">Client Secret</label>
          <input type="password" id="sg-yt-secret"
            placeholder="GOCSPX-…" autocomplete="off"
            value="${esc(s.ytClientSecret)}" />
        </div>
      </div>
      <div class="form-group" data-field="ytRefreshToken">
        <label for="sg-yt-token">Refresh Token</label>
        <textarea id="sg-yt-token" rows="3"
          placeholder="1//01… (run: node youtube-auth.js)"
          style="font-size:0.8rem;">${esc(s.ytRefreshToken)}</textarea>
      </div>
    </div>
  `;

  // Auto-save with debounce + checkmarks
  let debounceTimer;
  container.querySelectorAll('input, textarea').forEach(el => {
    updateCheck(el);
    el.addEventListener('input', () => {
      updateCheck(el);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => persist(container), 400);
    });
  });
}

function updateCheck(input) {
  const group = input.closest('[data-field]');
  if (group) group.classList.toggle('has-value', !!input.value.trim());
}

function persist(container) {
  saveSettings({
    claudeApiKey:   container.querySelector('#sg-claude-key').value.trim(),
    heygenApiKey:   container.querySelector('#sg-hg-apikey').value.trim(),
    heygenAvatarId: container.querySelector('#sg-hg-avatar').value.trim(),
    heygenVoiceId:  container.querySelector('#sg-hg-voice').value.trim(),
    ytClientId:     container.querySelector('#sg-yt-clientid').value.trim(),
    ytClientSecret: container.querySelector('#sg-yt-secret').value.trim(),
    ytRefreshToken: container.querySelector('#sg-yt-token').value.trim(),
  });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
