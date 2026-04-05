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
      <h2>HeyGen</h2>
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:16px;">
        Scripts are generated and copied manually into
        <a href="https://www.heygen.com" target="_blank" rel="noopener"
          style="color:var(--accent);">heygen.com</a>
        — no API key required.
      </p>
      <div class="form-group" data-field="heygenVoiceId">
        <label for="sg-hg-voice">
          Voice ID
          <span style="color:var(--muted);font-weight:400"> — optional, for your own reference</span>
        </label>
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

    <div class="card">
      <h2>Reddit Distribution</h2>
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:16px;">
        Create a Reddit "script" app at
        <a href="https://www.reddit.com/prefs/apps" target="_blank" rel="noopener"
          style="color:var(--accent);">reddit.com/prefs/apps</a>.
        Set type to <strong>script</strong>.
        Note: browser CORS may block direct posting — use from a local server context.
      </p>
      <div class="form-row">
        <div class="form-group" data-field="redditClientId">
          <label for="sg-reddit-id">Client ID</label>
          <input type="text" id="sg-reddit-id"
            placeholder="14-character app ID" value="${esc(s.redditClientId)}" />
        </div>
        <div class="form-group" data-field="redditClientSecret">
          <label for="sg-reddit-secret">Client Secret</label>
          <input type="password" id="sg-reddit-secret"
            placeholder="App secret" autocomplete="off" value="${esc(s.redditClientSecret)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" data-field="redditUsername">
          <label for="sg-reddit-user">Reddit Username</label>
          <input type="text" id="sg-reddit-user"
            placeholder="u/yourusername (without u/)" value="${esc(s.redditUsername)}" />
        </div>
        <div class="form-group" data-field="redditPassword">
          <label for="sg-reddit-pass">Reddit Password</label>
          <input type="password" id="sg-reddit-pass"
            autocomplete="off" value="${esc(s.redditPassword)}" />
        </div>
      </div>
      <div class="form-group" data-field="redditSubreddits">
        <label for="sg-reddit-subs">Default Subreddits (comma-separated, without r/)</label>
        <input type="text" id="sg-reddit-subs"
          placeholder="programming, webdev, learnprogramming, technology, artificial"
          value="${esc(s.redditSubreddits)}" />
      </div>
    </div>

    <div class="card">
      <h2>Article Publishing</h2>
      <div class="form-group" data-field="devToApiKey">
        <label for="sg-devto-key">
          Dev.to API Key
          <span style="color:var(--muted);font-weight:400"> — Settings → Account → DEV Community API Keys</span>
        </label>
        <input type="password" id="sg-devto-key"
          autocomplete="off" placeholder="Dev.to API key" value="${esc(s.devToApiKey)}" />
      </div>
      <div class="form-row">
        <div class="form-group" data-field="hashnodeApiKey">
          <label for="sg-hashnode-key">
            Hashnode API Key
          </label>
          <input type="password" id="sg-hashnode-key"
            autocomplete="off" placeholder="Hashnode personal access token"
            value="${esc(s.hashnodeApiKey)}" />
        </div>
        <div class="form-group" data-field="hashnodePublicationId">
          <label for="sg-hashnode-pub">Hashnode Publication ID</label>
          <input type="text" id="sg-hashnode-pub"
            placeholder="Found in your blog dashboard URL"
            value="${esc(s.hashnodePublicationId)}" />
        </div>
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
    claudeApiKey:          container.querySelector('#sg-claude-key').value.trim(),
    heygenVoiceId:         container.querySelector('#sg-hg-voice').value.trim(),
    ytClientId:            container.querySelector('#sg-yt-clientid').value.trim(),
    ytClientSecret:        container.querySelector('#sg-yt-secret').value.trim(),
    ytRefreshToken:        container.querySelector('#sg-yt-token').value.trim(),
    sheetsId:              container.querySelector('#sg-sheets-id').value.trim(),
    emailjsServiceId:      container.querySelector('#sg-ejs-service').value.trim(),
    emailjsTemplateId:     container.querySelector('#sg-ejs-template').value.trim(),
    emailjsPublicKey:      container.querySelector('#sg-ejs-key').value.trim(),
    recipientEmail:        container.querySelector('#sg-ejs-email').value.trim(),
    redditClientId:        container.querySelector('#sg-reddit-id').value.trim(),
    redditClientSecret:    container.querySelector('#sg-reddit-secret').value.trim(),
    redditUsername:        container.querySelector('#sg-reddit-user').value.trim(),
    redditPassword:        container.querySelector('#sg-reddit-pass').value.trim(),
    redditSubreddits:      container.querySelector('#sg-reddit-subs').value.trim(),
    devToApiKey:           container.querySelector('#sg-devto-key').value.trim(),
    hashnodeApiKey:        container.querySelector('#sg-hashnode-key').value.trim(),
    hashnodePublicationId: container.querySelector('#sg-hashnode-pub').value.trim(),
  });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
