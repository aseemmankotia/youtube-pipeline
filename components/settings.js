/**
 * Settings Component — manages all API credentials in one place.
 * Auto-saved to localStorage on every keystroke (400 ms debounce).
 * Green ✓ appears next to each filled field.
 * Exports getSettings() for all pipeline components.
 */

const SETTINGS_KEY = 'yt_pipeline_settings';

export function getSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); }
  catch { return {}; }
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
          placeholder="sk-ant-…" autocomplete="off" value="${esc(s.claudeApiKey)}" />
      </div>
    </div>

    <div class="card">
      <h2>HeyGen Video Generation</h2>
      <div class="form-row">
        <div class="form-group" data-field="heygenApiKey">
          <label for="sg-hg-apikey">HeyGen API Key</label>
          <input type="password" id="sg-hg-apikey"
            placeholder="sk_V2_…" autocomplete="off" value="${esc(s.heygenApiKey)}" />
        </div>
        <div class="form-group" data-field="heygenAvatarId">
          <label for="sg-hg-avatar">Avatar ID</label>
          <input type="text" id="sg-hg-avatar"
            placeholder="e.g. josh_lite3_20230714" value="${esc(s.heygenAvatarId)}" />
        </div>
      </div>
      <div class="form-group" data-field="heygenVoiceId">
        <label for="sg-hg-voice">Voice ID</label>
        <input type="text" id="sg-hg-voice"
          placeholder="e.g. 3ec6fddde15a4f5bacf2c1557ecea26f" value="${esc(s.heygenVoiceId)}" />
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
            placeholder="386017…apps.googleusercontent.com" value="${esc(s.ytClientId)}" />
        </div>
        <div class="form-group" data-field="ytClientSecret">
          <label for="sg-yt-secret">Client Secret</label>
          <input type="password" id="sg-yt-secret"
            placeholder="GOCSPX-…" autocomplete="off" value="${esc(s.ytClientSecret)}" />
        </div>
      </div>
      <div class="form-group" data-field="ytRefreshToken">
        <label for="sg-yt-token">Refresh Token</label>
        <textarea id="sg-yt-token" rows="3"
          placeholder="1//01… (run: node youtube-auth.js)"
          style="font-size:0.8rem;">${esc(s.ytRefreshToken)}</textarea>
      </div>
    </div>

    <div class="card">
      <h2>Google Sheets Logging</h2>
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:16px;">
        Appends a row to your spreadsheet after each generation and upload.
        Requires the Sheets scope — re-run <code>node youtube-auth.js</code> if your token predates this feature.
      </p>
      <div class="form-group" data-field="sheetsId">
        <label for="sg-sheets-id">Google Sheet ID</label>
        <input type="text" id="sg-sheets-id"
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          value="${esc(s.sheetsId)}" />
        <p style="font-size:0.8rem;color:var(--muted);margin-top:4px;">
          Found in the spreadsheet URL: docs.google.com/spreadsheets/d/<strong>SHEET_ID</strong>/edit
        </p>
      </div>
    </div>

    <div class="card">
      <h2>Email Notifications <span style="font-size:0.8rem;color:var(--muted);font-weight:400">(EmailJS)</span></h2>
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:16px;">
        Sends an email after each successful YouTube upload. Free tier at
        <a href="https://www.emailjs.com" target="_blank" rel="noopener" style="color:var(--accent);">emailjs.com</a>
        — no backend needed.
      </p>
      <div class="form-row">
        <div class="form-group" data-field="emailjsServiceId">
          <label for="sg-ejs-service">Service ID</label>
          <input type="text" id="sg-ejs-service"
            placeholder="service_xxxxxxx" value="${esc(s.emailjsServiceId)}" />
        </div>
        <div class="form-group" data-field="emailjsTemplateId">
          <label for="sg-ejs-template">Template ID</label>
          <input type="text" id="sg-ejs-template"
            placeholder="template_xxxxxxx" value="${esc(s.emailjsTemplateId)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" data-field="emailjsPublicKey">
          <label for="sg-ejs-key">Public Key</label>
          <input type="password" id="sg-ejs-key"
            placeholder="Your EmailJS public key" autocomplete="off" value="${esc(s.emailjsPublicKey)}" />
        </div>
        <div class="form-group" data-field="recipientEmail">
          <label for="sg-ejs-email">Recipient Email</label>
          <input type="text" id="sg-ejs-email"
            placeholder="you@example.com" value="${esc(s.recipientEmail)}" />
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px;">
        <button class="btn btn-secondary" id="sg-test-email-btn">Send Test Email</button>
        <span id="sg-test-email-status" style="font-size:0.85rem;color:var(--muted);"></span>
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

  // Test email button — dispatches event handled in app.js
  container.querySelector('#sg-test-email-btn').addEventListener('click', async () => {
    const statusEl = container.querySelector('#sg-test-email-status');
    statusEl.style.color = 'var(--muted)';
    statusEl.textContent = 'Sending…';
    document.dispatchEvent(new CustomEvent('test-email', {
      detail: { onResult: (ok, msg) => {
        statusEl.style.color = ok ? '#7af57a' : '#f57a7a';
        statusEl.textContent = msg;
        setTimeout(() => { statusEl.textContent = ''; }, 4000);
      }},
    }));
  });
}

function updateCheck(input) {
  const group = input.closest('[data-field]');
  if (group) group.classList.toggle('has-value', !!input.value.trim());
}

function persist(container) {
  saveSettings({
    claudeApiKey:     container.querySelector('#sg-claude-key').value.trim(),
    heygenApiKey:     container.querySelector('#sg-hg-apikey').value.trim(),
    heygenAvatarId:   container.querySelector('#sg-hg-avatar').value.trim(),
    heygenVoiceId:    container.querySelector('#sg-hg-voice').value.trim(),
    ytClientId:       container.querySelector('#sg-yt-clientid').value.trim(),
    ytClientSecret:   container.querySelector('#sg-yt-secret').value.trim(),
    ytRefreshToken:   container.querySelector('#sg-yt-token').value.trim(),
    sheetsId:         container.querySelector('#sg-sheets-id').value.trim(),
    emailjsServiceId: container.querySelector('#sg-ejs-service').value.trim(),
    emailjsTemplateId:container.querySelector('#sg-ejs-template').value.trim(),
    emailjsPublicKey: container.querySelector('#sg-ejs-key').value.trim(),
    recipientEmail:   container.querySelector('#sg-ejs-email').value.trim(),
  });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
