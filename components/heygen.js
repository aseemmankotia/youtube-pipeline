/**
 * HeyGen Video Generation Component — Step 3
 * Credentials are read from Settings tab via getSettings().
 */

import { getSettings }  from './settings.js';
import { cleanScript }  from './clean-script.js';

const POLL_INTERVAL_MS = 10_000;

export function renderHeyGen(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Generate Video</h2>

      <div class="form-group">
        <label for="hg-script">Script</label>
        <textarea id="hg-script" rows="8"
          placeholder="Script auto-filled from Step 2, or paste manually…"></textarea>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="generate-video-btn">
          <span>Generate Video</span>
        </button>
        <button class="btn btn-secondary" id="hg-retry-btn" style="display:none;">
          Retry
        </button>
      </div>

      <div id="hg-status"></div>
    </div>

    <div id="hg-progress-card" style="display:none;" class="card">
      <h2>Rendering Video…</h2>
      <div class="progress-wrap">
        <div class="progress-bar" id="hg-progress-bar"></div>
      </div>
      <p id="hg-progress-label" style="font-size:0.85rem;color:var(--muted);margin-top:8px;"></p>
    </div>

    <div id="hg-result-card" style="display:none;" class="card">
      <h2>Video Ready</h2>
      <video id="hg-video-player" controls style="width:100%;border-radius:8px;background:#000;"></video>
      <div class="script-actions" style="margin-top:12px;">
        <a class="btn btn-success" id="hg-download-btn" download="heygen-video.mp4">Download MP4</a>
      </div>
    </div>

    <div id="hg-enhance-card" style="display:none;" class="card">
      <h2>✨ Enhance with Slides</h2>
      <p style="font-size:0.88rem;color:var(--muted);margin-bottom:16px;">
        Add animated slide backgrounds with your AI avatar as picture-in-picture.
        Runs locally via Node.js — no upload required.
      </p>
      <button class="btn btn-secondary" id="hg-enhance-btn">⬇ Download Render Files</button>
      <div id="hg-enhance-instructions" style="display:none;margin-top:16px;">
        <div class="status-bar info" style="flex-direction:column;align-items:flex-start;gap:10px;padding:16px;">
          <strong style="font-size:0.9rem;">Files downloaded — follow these steps:</strong>
          <ol style="padding-left:20px;font-size:0.84rem;line-height:2;color:var(--text);">
            <li>Move <code>render-input.json</code> and <code>.env</code> into your <code>~/youtube-pipeline</code> folder</li>
            <li>Open Terminal and run: <code style="background:#111;padding:2px 8px;border-radius:4px;">npm run render</code></li>
            <li>Wait for <em>✅ Render complete</em>, then select the output file below</li>
          </ol>
        </div>
        <div class="form-group" style="margin-top:16px;">
          <label for="hg-enhanced-file">Select rendered video to send to YouTube upload</label>
          <input type="file" id="hg-enhanced-file" accept=".mp4,video/*"
            style="margin-top:8px;color:var(--text);font-size:0.88rem;" />
        </div>
        <div id="hg-enhanced-status" style="font-size:0.85rem;color:#7af57a;margin-top:8px;display:none;">
          ✓ Enhanced video loaded — switching to Upload tab…
        </div>
      </div>
    </div>
  `;

  container._setScript = (script) => {
    container.querySelector('#hg-script').value = script || '';
  };
  container._topic   = '';
  container._videoId = '';

  container.querySelector('#generate-video-btn')
    .addEventListener('click', () => startGeneration(container));

  container.querySelector('#hg-retry-btn')
    .addEventListener('click', () => {
      container.querySelector('#hg-retry-btn').style.display = 'none';
      startGeneration(container);
    });

  // Enhance with Slides button — downloads render-input.json + .env
  container.querySelector('#hg-enhance-btn').addEventListener('click', () => {
    const renderInput = {
      topic:            container._topic || '',
      script:           container.querySelector('#hg-script').value.trim(),
      heygen_video_url: container.querySelector('#hg-video-player').src,
      output_filename:  'final-video.mp4',
    };
    triggerDownload(
      JSON.stringify(renderInput, null, 2),
      'render-input.json',
      'application/json'
    );

    // Also download .env with the Anthropic API key from Settings
    const { claudeApiKey } = getSettings();
    if (claudeApiKey) {
      triggerDownload(
        `ANTHROPIC_API_KEY=${claudeApiKey}\n`,
        '.env',
        'text/plain'
      );
    }

    container.querySelector('#hg-enhance-instructions').style.display = 'block';
  });

  // File picker — load rendered MP4 and send to Tab 4
  container.querySelector('#hg-enhanced-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    const statusEl = container.querySelector('#hg-enhanced-status');
    statusEl.style.display = 'block';
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('video-complete', {
        detail: {
          videoUrl: objUrl,
          videoId:  container._videoId,
          script:   container.querySelector('#hg-script').value.trim(),
          topic:    container._topic,
        },
      }));
    }, 800);
  });

  // Auto-start when script arrives from Step 2 (if credentials are saved)
  document.addEventListener('send-to-video', (e) => {
    const { script, topic } = e.detail || {};
    if (script) container._setScript(script);
    if (topic)  container._topic = topic;
    const { heygenApiKey, heygenAvatarId, heygenVoiceId } = getSettings();
    if (heygenApiKey && heygenAvatarId && heygenVoiceId) startGeneration(container);
  });
}

async function startGeneration(container) {
  const { heygenApiKey: apiKey, heygenAvatarId: avatarId, heygenVoiceId: voiceId } = getSettings();
  const script = container.querySelector('#hg-script').value.trim();

  const statusEl     = container.querySelector('#hg-status');
  const progressCard = container.querySelector('#hg-progress-card');
  const resultCard   = container.querySelector('#hg-result-card');
  const btn          = container.querySelector('#generate-video-btn');
  const retryBtn     = container.querySelector('#hg-retry-btn');

  statusEl.innerHTML = '';
  progressCard.style.display = 'none';
  resultCard.style.display   = 'none';
  retryBtn.style.display     = 'none';

  if (!apiKey || !avatarId || !voiceId) {
    statusEl.innerHTML = err('HeyGen credentials missing — open <strong>⚙ Settings</strong> to add them.');
    return;
  }
  if (!script) {
    statusEl.innerHTML = err('Script is empty — generate one in Step 2 first.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Submitting…</span>';

  try {
    const cleanedScript = cleanScript(script);
    const chunks = splitIntoChunks(cleanedScript);
    statusEl.innerHTML = info(
      chunks.length > 1
        ? `Splitting script into ${chunks.length} parts…`
        : 'Submitting script…'
    );

    const videoId = await submitJob({ apiKey, avatarId, voiceId, chunks });
    statusEl.innerHTML = info(`Job submitted — Video ID: <code>${videoId}</code>`);
    progressCard.style.display = 'block';
    await pollUntilDone({ apiKey, videoId, script, container });
  } catch (e) {
    statusEl.innerHTML = err(escHtml(e.message));
    retryBtn.style.display = 'inline-flex';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Generate Video</span>';
  }
}

async function submitJob({ apiKey, avatarId, voiceId, chunks }) {
  const payload = {
    video_inputs: chunks.map(chunk => ({
      character: {
        type: 'avatar',
        avatar_id: avatarId,
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        input_text: chunk,
        voice_id: voiceId,
      },
    })),
    dimension: { width: 1280, height: 720 },
  };

  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || JSON.stringify(data);
    throw new Error(`HeyGen error (${res.status}): ${msg}`);
  }

  const videoId = data?.data?.video_id || data?.video_id;
  if (!videoId) throw new Error(`No video_id returned. Response: ${JSON.stringify(data)}`);
  return videoId;
}

async function pollUntilDone({ apiKey, videoId, script, container }) {
  const progressBar   = container.querySelector('#hg-progress-bar');
  const progressLabel = container.querySelector('#hg-progress-label');
  const progressCard  = container.querySelector('#hg-progress-card');
  const resultCard    = container.querySelector('#hg-result-card');
  const statusEl      = container.querySelector('#hg-status');
  const retryBtn      = container.querySelector('#hg-retry-btn');

  const startTime   = Date.now();
  const MAX_WAIT_MS = 20 * 60 * 1000;
  const estimated   = 10 * 60 * 1000;

  let animFrame;
  function animateBar() {
    const elapsed = Date.now() - startTime;
    const pct = Math.round(Math.min(elapsed / estimated, 1) * 90);
    progressBar.style.width = pct + '%';
    const s = Math.round(elapsed / 1000);
    progressLabel.textContent = `Elapsed: ${Math.floor(s / 60)}m ${s % 60}s — HeyGen is rendering…`;
    if (pct < 90) animFrame = requestAnimationFrame(animateBar);
  }
  animFrame = requestAnimationFrame(animateBar);

  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - startTime > MAX_WAIT_MS) {
        cancelAnimationFrame(animFrame);
        reject(new Error('Timed out after 20 minutes.'));
        return;
      }
      try {
        const res = await fetch(
          `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
          { headers: { 'X-Api-Key': apiKey } }
        );
        const data     = await res.json();
        const status   = data?.data?.status;
        const videoUrl = data?.data?.video_url;

        if (status === 'completed' && videoUrl) {
          cancelAnimationFrame(animFrame);
          progressBar.style.width = '100%';
          progressLabel.textContent = 'Done!';
          setTimeout(() => { progressCard.style.display = 'none'; }, 800);

          container.querySelector('#hg-video-player').src = videoUrl;
          container.querySelector('#hg-download-btn').href = videoUrl;
          container._videoId = videoId;
          resultCard.style.display = 'block';
          container.querySelector('#hg-enhance-card').style.display = 'block';
          statusEl.innerHTML = `<div class="status-bar success">Video ready!</div>`;
          document.dispatchEvent(new CustomEvent('video-complete', {
            detail: { videoUrl, videoId, script, topic: container._topic },
          }));
          resolve(videoUrl);

        } else if (status === 'failed') {
          cancelAnimationFrame(animFrame);
          const reason = data?.data?.error?.message || 'Unknown error';
          retryBtn.style.display = 'inline-flex';
          reject(new Error(`Rendering failed: ${reason}`));

        } else {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (e) {
        cancelAnimationFrame(animFrame);
        reject(e);
      }
    };
    setTimeout(poll, POLL_INTERVAL_MS);
  });
}

// ── Script helpers ────────────────────────────────────────────────────────────

const CHUNK_MAX = 4500;

/**
 * Split text into ≤ CHUNK_MAX-char chunks, breaking only at sentence ends.
 */
function splitIntoChunks(text) {
  if (text.length <= CHUNK_MAX) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > CHUNK_MAX) {
    // Find the last ". " or ".\n" at or before CHUNK_MAX
    let cutAt = -1;
    for (let i = CHUNK_MAX; i > 0; i--) {
      if (remaining[i] === '.' && (remaining[i + 1] === ' ' || remaining[i + 1] === '\n' || i + 1 === remaining.length)) {
        cutAt = i + 1;
        break;
      }
    }
    // No sentence boundary found — hard cut at CHUNK_MAX
    if (cutAt === -1) cutAt = CHUNK_MAX;

    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

const err  = (msg) => `<div class="status-bar error">${msg}</div>`;
const info = (msg) => `<div class="status-bar info">${msg}</div>`;

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
