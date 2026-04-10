/**
 * YouTube Upload Component — Step 4
 * Credentials are read from Settings tab via getSettings().
 * Upload flow:
 *   1. Refresh access token via POST https://oauth2.googleapis.com/token
 *   2. Download HeyGen video blob (detects actual MIME type from response headers)
 *   3. Initiate resumable upload session with correct Content-Type
 *   4. Upload binary in 5 MB chunks with live progress bar
 *   5. Show "View on YouTube" link when done
 */

import { getSettings } from './settings.js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

export function renderYouTube(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Upload to YouTube</h2>

      <div class="form-group">
        <label for="yt-video-url">Video Source</label>
        <input type="text" id="yt-video-url"
          placeholder="Auto-filled from Tab 3, or paste a video URL…"
          style="margin-bottom:8px;" />
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font-size:0.82rem;color:var(--muted);">or select a local file:</span>
          <input type="file" id="yt-local-file" accept=".mp4,video/*"
            style="font-size:0.82rem;color:var(--text);" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="yt-title">Title</label>
          <input type="text" id="yt-title" placeholder="Auto-generated from topic…" />
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

  // Local file picker — create blob URL and use as video source
  container.querySelector('#yt-local-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (container._localFileUrl) URL.revokeObjectURL(container._localFileUrl);
    container._localFileUrl = URL.createObjectURL(file);
    container.querySelector('#yt-video-url').value = container._localFileUrl;
  });
  container._localFileUrl = '';

  container._heygenVideoId  = '';
  container._heygenVideoUrl = '';

  document.addEventListener('video-complete', async (e) => {
    const { videoUrl, videoId, script, topic } = e.detail || {};
    if (videoUrl) container.querySelector('#yt-video-url').value = videoUrl;
    if (videoId)  container._heygenVideoId  = videoId;
    if (videoUrl) container._heygenVideoUrl = videoUrl;
    if (script)   await fillMetadata(container, script, topic);
    const { ytClientId, ytClientSecret, ytRefreshToken } = getSettings();
    if (ytClientId && ytClientSecret && ytRefreshToken) startUpload(container);
  });

  container._setVideoData = async ({ videoUrl, script, topic } = {}) => {
    if (videoUrl) container.querySelector('#yt-video-url').value = videoUrl;
    if (script)   await fillMetadata(container, script, topic);
  };
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function stripMd(str) {
  return String(str || '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
    .replace(/`[^`]*`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*>]\s*/gm, '')
    .trim();
}

function toTitleCase(str) {
  const minors = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','is']);
  return str.replace(/\w+/g, (word, offset) => {
    if (offset > 0 && minors.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/** Try to load slide sections from render-input.json in the same origin */
async function loadSlideSections() {
  try {
    const res = await fetch('./render-input.json');
    if (!res.ok) return null;
    const data = await res.json();
    // sections may have been stored alongside the input (not standard, fallback null)
    return Array.isArray(data.sections) ? data.sections : null;
  } catch { return null; }
}

/** Extract section headings from script markdown (lines starting with #) */
function extractHeadingsFromScript(script) {
  return script.split('\n')
    .filter(l => /^#{1,3}\s/.test(l))
    .map(l => stripMd(l))
    .filter(Boolean)
    .slice(0, 8);
}

/** Estimate word-per-second timestamps for sections */
function buildTimestamps(sections, script) {
  const totalWords = script.split(/\s+/).filter(Boolean).length;
  const totalSecs  = Math.round(totalWords / 150 * 60); // 150 wpm
  const count      = sections.length;
  const lines = ['0:00 - Intro'];
  for (let i = 1; i < count; i++) {
    const secs = Math.round((i / count) * totalSecs);
    const m = Math.floor(secs / 60);
    const s = String(secs % 60).padStart(2, '0');
    lines.push(`${m}:${s} - ${sections[i]}`);
  }
  return lines;
}

/** Extract keyword tags from script + topic */
function extractKeywords(script, topic) {
  const stopWords = new Set([
    'the','and','for','that','this','with','have','from','they','will','been','their',
    'what','when','where','which','there','about','would','could','should','your','you',
    'are','was','were','has','had','not','but','all','any','can','its','our','more',
    'also','just','like','into','than','then','some','over','such','use','used',
  ]);
  const text = `${topic} ${script}`;
  const freq = {};
  const words = text.match(/\b[A-Za-z]{4,}\b/g) || [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (!stopWords.has(lw)) freq[lw] = (freq[lw] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
}

async function fillMetadata(container, script, topic) {
  // ── Title ──────────────────────────────────────────────────────────────────
  const year      = new Date().getFullYear();
  const cleanRaw  = stripMd(topic || '').trim() ||
    script.split('\n').map(l => stripMd(l)).find(l => l.length > 5) || 'My Video';
  const titleBase = toTitleCase(cleanRaw.replace(/[*_`#]/g, '').trim());
  const title     = `${titleBase} (${year})`.slice(0, 80);

  // ── Hook: first 2 sentences from cleaned script ────────────────────────────
  const plainScript = script.replace(/\n+/g, ' ');
  const allSentences = plainScript.match(/[^.!?]+[.!?]+/g) || [];
  const hook = allSentences.slice(0, 2).map(s => stripMd(s).trim()).join(' ').trim();

  // ── Section bullets ────────────────────────────────────────────────────────
  const slideSections = await loadSlideSections();
  let sectionTitles;
  if (slideSections && slideSections.length > 0) {
    sectionTitles = slideSections.map(s => (typeof s === 'string' ? s : s.title)).filter(Boolean);
  } else {
    sectionTitles = extractHeadingsFromScript(script);
  }
  // Fall back to word-frequency chunks if no headings found
  if (sectionTitles.length === 0) {
    const wordCount = plainScript.split(/\s+/).length;
    const estMins   = Math.round(wordCount / 150);
    sectionTitles   = [`Introduction`, `Main Content (${estMins} min)`, `Conclusion`];
  }
  const bulletList = sectionTitles.map(t => `• ${t}`).join('\n');

  // ── Timestamps ────────────────────────────────────────────────────────────
  const timestamps = buildTimestamps(sectionTitles, script);

  // ── Keywords / tags ───────────────────────────────────────────────────────
  const keywords = extractKeywords(script, topic || '');
  const hashtagLine = keywords.slice(0, 8).map(k => `#${k}`).join(' ');
  const tagsValue   = keywords.join(', ');

  // ── Niche line ────────────────────────────────────────────────────────────
  const nicheWord = stripMd(topic || 'AI & Technology').split(/\s+/).slice(0, 3).join(' ');

  // ── Assemble description ───────────────────────────────────────────────────
  const description = [
    hook,
    '',
    'In this video:',
    bulletList,
    '',
    '⏱️ Timestamps:',
    timestamps.join('\n'),
    '',
    `🔔 Subscribe for weekly videos on ${nicheWord}`,
    '👍 Like if you found this helpful!',
    '',
    '📌 Topics covered:',
    hashtagLine,
    '',
    '---',
    'Generated with AI | Script by Claude | Avatar by HeyGen',
  ].join('\n');

  container.querySelector('#yt-title').value       = title;
  container.querySelector('#yt-description').value = description;
  container.querySelector('#yt-tags').value        = tagsValue;

  // Expose description so app.js can save it to history
  container._generatedDescription = description;
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

    statusEl.innerHTML = infoBar('Validating YouTube connection…');
    const tokenOk = await validateYouTubeToken(accessToken);
    if (!tokenOk) throw new Error('TOKEN_EXPIRED');

    // Step 1: Download the actual video binary from HeyGen.
    // We read the Content-Type from the response so YouTube receives the
    // correct MIME type — avoids "Processing abandoned" when HeyGen serves
    // something other than video/mp4.
    statusEl.innerHTML = infoBar('Downloading video from HeyGen…');
    const { blob: videoBlob, mimeType } = await fetchVideoBlob(videoUrl);

    statusEl.innerHTML = infoBar(`Initiating YouTube upload session… (${mb(videoBlob.size)} MB, ${mimeType})`);
    const uploadUrl = await initiateResumableUpload({
      accessToken, title, description, tags, privacy,
      fileSize: videoBlob.size,
      mimeType,
    });

    // Step 2: Upload the binary in 5 MB chunks with a live progress bar.
    progressCard.style.display = 'block';
    statusEl.innerHTML = '';
    const videoId = await uploadInChunks({ uploadUrl, videoBlob, mimeType, container });

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
        youtubeTitle:   title,
        heygenVideoId:  container._heygenVideoId,
        heygenVideoUrl: container._heygenVideoUrl,
      },
    }));

  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      statusEl.innerHTML = tokenExpiredBar();
    } else {
      statusEl.innerHTML = errBar(esc(err.message));
    }
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
    const desc = (data.error_description || '').toLowerCase();
    if (data.error === 'invalid_grant' || desc.includes('expired') || desc.includes('revoked')) {
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error(`Token refresh failed: ${data.error_description || data.error || res.statusText}`);
  }
  return data.access_token;
}

async function validateYouTubeToken(accessToken) {
  try {
    const resp = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    return resp.ok;
  } catch { return false; }
}

async function fetchVideoBlob(videoUrl) {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Could not download video (${res.status}): ${res.statusText}`);
  const blob = await res.blob();
  // Use the server-reported MIME type; fall back to video/mp4
  const mimeType = (res.headers.get('Content-Type') || 'video/mp4').split(';')[0].trim();
  return { blob, mimeType };
}

async function initiateResumableUpload({ accessToken, title, description, tags, privacy, fileSize, mimeType }) {
  const res = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        'Authorization':           `Bearer ${accessToken}`,
        'Content-Type':            'application/json',
        'X-Upload-Content-Type':   mimeType,
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify({
        snippet: { title, description, tags, categoryId: '28' },
        status:  { privacyStatus: privacy, selfDeclaredMadeForKids: false },
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

async function uploadInChunks({ uploadUrl, videoBlob, mimeType, container }) {
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
        'Content-Type':  mimeType,
      },
      body: chunk,
    });

    if (res.status === 308) {
      // Intermediate chunk accepted — keep going
      offset = end;
      const pct = Math.round((offset / total) * 100);
      progressBar.style.width   = pct + '%';
      progressLabel.textContent = `Uploading… ${pct}% (${mb(offset)} / ${mb(total)} MB)`;

    } else if (res.status === 200 || res.status === 201) {
      // Final chunk accepted — upload complete
      progressBar.style.width   = '100%';
      progressLabel.textContent = 'Upload complete!';
      const data = await res.json();
      if (!data.id) throw new Error(`Upload finished but no video ID returned. Response: ${JSON.stringify(data)}`);
      return data.id;

    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Upload chunk failed (${res.status}): ${errData?.error?.message || res.statusText}`);
    }
  }

  throw new Error('Upload loop ended without a completed response — unexpected state.');
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const errBar     = (msg) => `<div class="status-bar error">${msg}</div>`;
const infoBar    = (msg) => `<div class="status-bar info">${msg}</div>`;
const successBar = (msg) => `<div class="status-bar success">${msg}</div>`;

function tokenExpiredBar() {
  const steps = [
    'Open Terminal',
    'Run: <code style="user-select:all;background:rgba(0,0,0,.15);padding:1px 5px;border-radius:3px;">cd ~/youtube-pipeline &amp;&amp; node youtube-auth.js</code>',
    'Log in with Google when the browser opens',
    'Run: <code style="user-select:all;background:rgba(0,0,0,.15);padding:1px 5px;border-radius:3px;">cat ~/youtube-pipeline/youtube-token.json</code>',
    'Copy the <strong>refresh_token</strong> value',
    'Paste it in <strong>⚙ Settings → YouTube Refresh Token</strong>',
    'Try uploading again',
  ].map((s, i) => `<li style="margin:4px 0;">${i + 1}. ${s}</li>`).join('');
  return `
    <div class="status-bar error" style="display:block;line-height:1.6;">
      <strong>⚠️ YouTube token expired or revoked.</strong> To fix:
      <ul style="margin:8px 0 4px;padding-left:0;list-style:none;">${steps}</ul>
    </div>`;
}
const mb         = (bytes) => (bytes / 1024 / 1024).toFixed(1);

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
