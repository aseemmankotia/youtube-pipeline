/**
 * YouTube Upload Component — Step 4
 * Credentials are read from Settings tab via getSettings().
 * Upload flow:
 *   1. Refresh access token via POST https://oauth2.googleapis.com/token
 *   2. Initiate resumable upload session
 *   3. Fetch video blob and upload in 5 MB chunks
 *   4. Show progress bar + "View on YouTube" link when done
 */

import { getSettings } from './settings.js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

export function renderYouTube(container) {
  container.innerHTML = `
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

  container.querySelector('#yt-upload-btn').addEventListener('click', () => startUpload(container));
  container.querySelector('#yt-retry-btn').addEventListener('click', () => {
    container.querySelector('#yt-retry-btn').style.display = 'none';
    startUpload(container);
  });

  container._heygenVideoId  = '';
  container._heygenVideoUrl = '';

  document.addEventListener('video-complete', (e) => {
    const { videoUrl, videoId, script, topic } = e.detail || {};
    if (videoUrl) container.querySelector('#yt-video-url').value = videoUrl;
    if (videoId)  container._heygenVideoId  = videoId;
    if (videoUrl) container._heygenVideoUrl = videoUrl;
    if (script)   fillMetadata(container, script, topic);
    const { ytClientId, ytClientSecret, ytRefreshToken } = getSettings();
    if (ytClientId && ytClientSecret && ytRefreshToken) startUpload(container);
  });

  container._setVideoData = ({ videoUrl, script, topic } = {}) => {
    if (videoUrl) container.querySelector('#yt-video-url').value = videoUrl;
    if (script)   fillMetadata(container, script, topic);
  };
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function fillMetadata(container, script, topic) {
  const lines = script.split('\n').map(l => l.trim()).filter(Boolean);
  const titleLine = lines.find(l => !l.startsWith('[')) || topic || 'My YouTube Video';
  const title = titleLine.slice(0, 100);
  const description = lines.filter(l => !l.startsWith('[')).slice(0, 3).join('\n');
  const tags = [...new Set(
    `${topic || ''} ${titleLine}`.split(/\W+/).filter(w => w.length >= 3 && w.length <= 20)
  )].slice(0, 10).join(', ');

  container.querySelector('#yt-title').value       = title;
  container.querySelector('#yt-description').value = description;
  container.querySelector('#yt-tags').value        = tags;
}

// ── Upload flow ───────────────────────────────────────────────────────────────

async function startUpload(container) {
  const { ytClientId: clientId, ytClientSecret: clientSecret, ytRefreshToken: refreshToken } = getSettings();
  const videoUrl    = container.querySelector('#yt-video-url').value.trim();
  const title       = container.querySelector('#yt-title').value.trim() || 'My YouTube Video';
  const description = container.querySelector('#yt-description').value.trim();
  const tags        = container.querySelector('#yt-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const privacy     = container.querySelector('#yt-privacy').value;

  const statusEl    = container.querySelector('#yt-status');
  const progressCard = container.querySelector('#yt-progress-card');
  const resultCard  = container.querySelector('#yt-result-card');
  const btn         = container.querySelector('#yt-upload-btn');
  const retryBtn    = container.querySelector('#yt-retry-btn');

  statusEl.innerHTML = '';
  progressCard.style.display = 'none';
  resultCard.style.display   = 'none';
  retryBtn.style.display     = 'none';

  if (!clientId || !clientSecret || !refreshToken) {
    statusEl.innerHTML = errBar('YouTube credentials missing — open <strong>⚙ Settings</strong> to add them.');
    return;
  }
  if (!videoUrl) {
    statusEl.innerHTML = errBar('No video URL — complete Step 3 first or paste a URL.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Preparing…</span>';

  try {
    statusEl.innerHTML = infoBar('Refreshing access token…');
    const accessToken = await refreshAccessToken({ clientId, clientSecret, refreshToken });

    statusEl.innerHTML = infoBar('Downloading video from HeyGen…');
    const videoBlob = await fetchVideoBlob(videoUrl);

    statusEl.innerHTML = infoBar('Initiating YouTube upload session…');
    const uploadUrl = await initiateResumableUpload({
      accessToken, title, description, tags, privacy,
      fileSize: videoBlob.size,
    });

    progressCard.style.display = 'block';
    statusEl.innerHTML = '';
    const videoId = await uploadInChunks({ uploadUrl, videoBlob, container });

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    container.querySelector('#yt-view-link').href = ytUrl;
    resultCard.style.display = 'block';
    statusEl.innerHTML = successBar(
      `Upload complete! <a href="${ytUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;">youtube.com/watch?v=${videoId}</a>`
    );
    document.dispatchEvent(new CustomEvent('upload-complete', {
      detail: {
        videoId,
        ytUrl,
        youtubeTitle:    title,
        heygenVideoId:   container._heygenVideoId,
        heygenVideoUrl:  container._heygenVideoUrl,
      },
    }));

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
      body: JSON.stringify({
        snippet: { title, description, tags, categoryId: '28' },
        status:  { privacyStatus: privacy },
      }),
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Failed to initiate upload (${res.status}): ${errData?.error?.message || res.statusText}`);
  }

  const uploadUrl = res.headers.get('Location');
  if (!uploadUrl) throw new Error('YouTube did not return an upload URL.');
  return uploadUrl;
}

async function uploadInChunks({ uploadUrl, videoBlob, container }) {
  const progressBar   = container.querySelector('#yt-progress-bar');
  const progressLabel = container.querySelector('#yt-progress-label');
  const total  = videoBlob.size;
  let   offset = 0;

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

    if (res.status === 308) {
      offset = end;
      const pct = Math.round((offset / total) * 100);
      progressBar.style.width = pct + '%';
      progressLabel.textContent = `Uploading… ${pct}% (${mb(offset)} / ${mb(total)} MB)`;

    } else if (res.status === 200 || res.status === 201) {
      progressBar.style.width = '100%';
      progressLabel.textContent = 'Upload complete!';
      return (await res.json()).id;

    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Upload chunk failed (${res.status}): ${errData?.error?.message || res.statusText}`);
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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
