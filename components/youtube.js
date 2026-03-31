/**
 * YouTube Upload Component — Step 4
 *
 * Credentials are stored in localStorage so they survive page reloads.
 * Upload flow:
 *   1. Refresh the access token via POST https://oauth2.googleapis.com/token
 *   2. Initiate a resumable upload session
 *   3. Fetch the video URL from HeyGen and upload it to YouTube in chunks
 *   4. Show progress bar + "View on YouTube" link when done
 */

const LS_KEY = 'yt_pipeline_creds';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

export function renderYouTube(container) {
  const saved = loadCreds();

  container.innerHTML = `
    <div class="card" id="yt-creds-card">
      <h2>YouTube Credentials</h2>
      <p style="font-size:0.85rem;color:var(--muted);margin-bottom:16px;">
        Stored in <code>localStorage</code> — never sent anywhere except Google's OAuth endpoint.
      </p>

      <div class="form-row">
        <div class="form-group">
          <label for="yt-client-id">Client ID</label>
          <input type="text" id="yt-client-id"
            placeholder="386017…apps.googleusercontent.com"
            value="${esc(saved.clientId)}" />
        </div>
        <div class="form-group">
          <label for="yt-client-secret">Client Secret</label>
          <input type="password" id="yt-client-secret"
            placeholder="GOCSPX-…" autocomplete="off"
            value="${esc(saved.clientSecret)}" />
        </div>
      </div>

      <div class="form-group">
        <label for="yt-refresh-token">Refresh Token</label>
        <textarea id="yt-refresh-token" rows="3"
          placeholder="1//01… (from youtube-token.json)"
          style="font-size:0.8rem;">${esc(saved.refreshToken)}</textarea>
      </div>

      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-secondary" id="yt-save-creds-btn">Save Credentials</button>
        <span id="yt-creds-status" style="font-size:0.85rem;color:var(--muted);"></span>
      </div>
    </div>

    <div class="card">
      <h2>Upload to YouTube</h2>

      <div class="form-group">
        <label for="yt-video-url">Video URL (from HeyGen)</label>
        <input type="text" id="yt-video-url"
          placeholder="Auto-filled when Step 3 completes, or paste manually…" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="yt-title">Title</label>
          <input type="text" id="yt-title" placeholder="Auto-generated from script…" />
        </div>
        <div class="form-group">
          <label for="yt-privacy">Privacy</label>
          <select id="yt-privacy">
            <option value="private" selected>Private</option>
            <option value="unlisted">Unlisted</option>
            <option value="public">Public</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="yt-description">Description</label>
        <textarea id="yt-description" rows="4"
          placeholder="Auto-generated from script…"></textarea>
      </div>

      <div class="form-group">
        <label for="yt-tags">Tags <span style="color:var(--muted);font-weight:400">(comma-separated)</span></label>
        <input type="text" id="yt-tags" placeholder="Auto-extracted from topic…" />
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="yt-upload-btn">
          <span>Upload to YouTube</span>
        </button>
        <button class="btn btn-secondary" id="yt-retry-btn" style="display:none;">Retry</button>
      </div>

      <div id="yt-status"></div>
    </div>

    <div id="yt-progress-card" class="card" style="display:none;">
      <h2>Uploading…</h2>
      <div class="progress-wrap">
        <div class="progress-bar" id="yt-progress-bar"></div>
      </div>
      <p id="yt-progress-label" style="font-size:0.85rem;color:var(--muted);margin-top:8px;"></p>
    </div>

    <div id="yt-result-card" class="card" style="display:none;">
      <h2>Uploaded!</h2>
      <a id="yt-view-link" href="#" target="_blank" rel="noopener"
        class="btn btn-success" style="margin-top:4px;">
        View on YouTube
      </a>
    </div>
  `;

  // Save creds button
  container.querySelector('#yt-save-creds-btn').addEventListener('click', () => {
    saveCreds(container);
  });

  // Upload button
  container.querySelector('#yt-upload-btn').addEventListener('click', () => {
    startUpload(container);
  });

  // Retry button
  container.querySelector('#yt-retry-btn').addEventListener('click', () => {
    container.querySelector('#yt-retry-btn').style.display = 'none';
    startUpload(container);
  });

  // Auto-fill when HeyGen video is ready
  document.addEventListener('video-complete', (e) => {
    const { videoUrl, script, topic } = e.detail || {};
    if (videoUrl) container.querySelector('#yt-video-url').value = videoUrl;
    if (script)   fillMetadata(container, script, topic);
    // Auto-start if credentials are already saved
    if (loadCreds().refreshToken) startUpload(container);
  });

  // Expose setter for app.js
  container._setVideoData = ({ videoUrl, script, topic } = {}) => {
    if (videoUrl) container.querySelector('#yt-video-url').value = videoUrl;
    if (script)   fillMetadata(container, script, topic);
  };
}

// ── Credentials helpers ───────────────────────────────────────────────────────

function loadCreds() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch { return {}; }
}

function saveCreds(container) {
  const creds = {
    clientId:     container.querySelector('#yt-client-id').value.trim(),
    clientSecret: container.querySelector('#yt-client-secret').value.trim(),
    refreshToken: container.querySelector('#yt-refresh-token').value.trim(),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(creds));
  const el = container.querySelector('#yt-creds-status');
  el.textContent = 'Saved!';
  el.style.color = '#7af57a';
  setTimeout(() => { el.textContent = ''; }, 2000);
}

// ── Metadata helpers ──────────────────────────────────────────────────────────

function fillMetadata(container, script, topic) {
  const lines = script.split('\n').map(l => l.trim()).filter(Boolean);

  // Title: first non-bracket line, or topic
  const titleLine = lines.find(l => !l.startsWith('[')) || topic || 'My YouTube Video';
  const title = titleLine.slice(0, 100);

  // Description: first 3 non-bracket lines joined
  const descLines = lines.filter(l => !l.startsWith('[')).slice(0, 3);
  const description = descLines.join('\n');

  // Tags: words from topic + first line, 3–20 chars, deduplicated
  const tagSource = `${topic || ''} ${titleLine}`;
  const tags = [...new Set(
    tagSource.split(/\W+/).filter(w => w.length >= 3 && w.length <= 20)
  )].slice(0, 10).join(', ');

  container.querySelector('#yt-title').value       = title;
  container.querySelector('#yt-description').value = description;
  container.querySelector('#yt-tags').value        = tags;
}

// ── Upload flow ───────────────────────────────────────────────────────────────

async function startUpload(container) {
  const creds = loadCreds();
  // Also check live input fields in case user hasn't saved yet
  const clientId     = container.querySelector('#yt-client-id').value.trim()     || creds.clientId;
  const clientSecret = container.querySelector('#yt-client-secret').value.trim() || creds.clientSecret;
  const refreshToken = container.querySelector('#yt-refresh-token').value.trim() || creds.refreshToken;
  const videoUrl     = container.querySelector('#yt-video-url').value.trim();
  const title        = container.querySelector('#yt-title').value.trim()        || 'My YouTube Video';
  const description  = container.querySelector('#yt-description').value.trim();
  const tags         = container.querySelector('#yt-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const privacy      = container.querySelector('#yt-privacy').value;

  const statusEl      = container.querySelector('#yt-status');
  const progressCard  = container.querySelector('#yt-progress-card');
  const resultCard    = container.querySelector('#yt-result-card');
  const btn           = container.querySelector('#yt-upload-btn');
  const retryBtn      = container.querySelector('#yt-retry-btn');

  statusEl.innerHTML = '';
  progressCard.style.display = 'none';
  resultCard.style.display   = 'none';
  retryBtn.style.display     = 'none';

  if (!clientId || !clientSecret) {
    statusEl.innerHTML = errBar('Enter your Client ID and Client Secret above.');
    return;
  }
  if (!refreshToken) {
    statusEl.innerHTML = errBar('Paste your Refresh Token above (from youtube-token.json).');
    return;
  }
  if (!videoUrl) {
    statusEl.innerHTML = errBar('No video URL — complete Step 3 first or paste a URL.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Preparing…</span>';

  try {
    // 1. Get a fresh access token
    statusEl.innerHTML = infoBar('Refreshing access token…');
    const accessToken = await refreshAccessToken({ clientId, clientSecret, refreshToken });

    // 2. Fetch the video blob from HeyGen's CDN
    statusEl.innerHTML = infoBar('Downloading video from HeyGen…');
    const videoBlob = await fetchVideoBlob(videoUrl);

    // 3. Initiate resumable upload session
    statusEl.innerHTML = infoBar('Initiating YouTube upload session…');
    const uploadUrl = await initiateResumableUpload({
      accessToken, title, description, tags, privacy,
      fileSize: videoBlob.size,
    });

    // 4. Upload in chunks with progress
    progressCard.style.display = 'block';
    statusEl.innerHTML = '';
    const videoId = await uploadInChunks({ uploadUrl, videoBlob, container });

    // 5. Done
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    container.querySelector('#yt-view-link').href = ytUrl;
    resultCard.style.display = 'block';
    statusEl.innerHTML = successBar(`Upload complete! <a href="${ytUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">youtube.com/watch?v=${videoId}</a>`);

    document.dispatchEvent(new CustomEvent('upload-complete', { detail: { videoId, ytUrl } }));

  } catch (err) {
    statusEl.innerHTML = errBar(esc(err.message));
    retryBtn.style.display = 'inline-flex';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Upload to YouTube</span>';
  }
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error || res.statusText}`);
  }
  return data.access_token;
}

async function fetchVideoBlob(videoUrl) {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Could not download video (${res.status}): ${res.statusText}`);
  return await res.blob();
}

async function initiateResumableUpload({ accessToken, title, description, tags, privacy, fileSize }) {
  const metadata = {
    snippet: {
      title,
      description,
      tags,
      categoryId: '28', // Science & Technology
    },
    status: {
      privacyStatus: privacy,
    },
  };

  const res = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization':           `Bearer ${accessToken}`,
        'Content-Type':            'application/json',
        'X-Upload-Content-Type':   'video/mp4',
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData?.error?.message || res.statusText;
    throw new Error(`Failed to initiate upload (${res.status}): ${msg}`);
  }

  const uploadUrl = res.headers.get('Location');
  if (!uploadUrl) throw new Error('YouTube did not return an upload URL.');
  return uploadUrl;
}

async function uploadInChunks({ uploadUrl, videoBlob, container }) {
  const progressBar   = container.querySelector('#yt-progress-bar');
  const progressLabel = container.querySelector('#yt-progress-label');
  const total = videoBlob.size;
  let offset  = 0;

  while (offset < total) {
    const end   = Math.min(offset + CHUNK_SIZE, total);
    const chunk = videoBlob.slice(offset, end);

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
        'Content-Type':  'video/mp4',
      },
      body: chunk,
    });

    // 308 = Resume Incomplete (more chunks needed)
    // 200/201 = complete
    if (res.status === 308) {
      offset = end;
      const pct = Math.round((offset / total) * 100);
      progressBar.style.width = pct + '%';
      progressLabel.textContent = `Uploading… ${pct}% (${mb(offset)} / ${mb(total)} MB)`;

    } else if (res.status === 200 || res.status === 201) {
      progressBar.style.width = '100%';
      progressLabel.textContent = 'Upload complete!';
      const data = await res.json();
      return data.id;

    } else {
      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || res.statusText;
      throw new Error(`Upload chunk failed (${res.status}): ${msg}`);
    }
  }

  throw new Error('Upload finished without a video ID — unexpected state.');
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const errBar     = (msg) => `<div class="status-bar error">${msg}</div>`;
const infoBar    = (msg) => `<div class="status-bar info">${msg}</div>`;
const successBar = (msg) => `<div class="status-bar success">${msg}</div>`;
const mb         = (bytes) => (bytes / 1024 / 1024).toFixed(1);

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
