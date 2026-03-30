/**
 * HeyGen Video Generation Component — Step 3
 * Sends the script to HeyGen's v2 API, polls for completion,
 * and shows a preview + download when ready.
 */

const POLL_INTERVAL_MS = 10_000;

export function renderHeyGen(container) {
  container.innerHTML = `
    <div class="card">
      <h2>Generate Video</h2>

      <div class="form-row">
        <div class="form-group">
          <label for="hg-api-key">HeyGen API Key</label>
          <input type="password" id="hg-api-key" placeholder="sk_V2_…" autocomplete="off" />
        </div>
        <div class="form-group">
          <label for="hg-avatar-id">Avatar ID</label>
          <input type="text" id="hg-avatar-id" placeholder="e.g. josh_lite3_20230714" />
        </div>
      </div>

      <div class="form-group">
        <label for="hg-voice-id">Voice ID</label>
        <input type="text" id="hg-voice-id" placeholder="e.g. 3ec6fddde15a4f5bacf2c1557ecea26f" />
      </div>

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
  `;

  // Setter used by app.js auto-pipeline
  container._setScript = (script) => {
    container.querySelector('#hg-script').value = script || '';
  };

  container.querySelector('#generate-video-btn')
    .addEventListener('click', () => startGeneration(container));

  container.querySelector('#hg-retry-btn')
    .addEventListener('click', () => {
      container.querySelector('#hg-retry-btn').style.display = 'none';
      startGeneration(container);
    });

  // Auto-start when script arrives from Step 2 (if credentials already filled)
  document.addEventListener('send-to-video', (e) => {
    const script = e.detail?.script;
    if (script) container._setScript(script);
    const apiKey   = container.querySelector('#hg-api-key').value.trim();
    const avatarId = container.querySelector('#hg-avatar-id').value.trim();
    const voiceId  = container.querySelector('#hg-voice-id').value.trim();
    if (apiKey && avatarId && voiceId) startGeneration(container);
  });
}

async function startGeneration(container) {
  const apiKey   = container.querySelector('#hg-api-key').value.trim();
  const avatarId = container.querySelector('#hg-avatar-id').value.trim();
  const voiceId  = container.querySelector('#hg-voice-id').value.trim();
  const script   = container.querySelector('#hg-script').value.trim();

  const statusEl      = container.querySelector('#hg-status');
  const progressCard  = container.querySelector('#hg-progress-card');
  const resultCard    = container.querySelector('#hg-result-card');
  const btn           = container.querySelector('#generate-video-btn');
  const retryBtn      = container.querySelector('#hg-retry-btn');

  statusEl.innerHTML = '';
  progressCard.style.display = 'none';
  resultCard.style.display   = 'none';
  retryBtn.style.display     = 'none';

  if (!apiKey)   { statusEl.innerHTML = err('Please enter your HeyGen API key.');  return; }
  if (!avatarId) { statusEl.innerHTML = err('Please enter an Avatar ID.');          return; }
  if (!voiceId)  { statusEl.innerHTML = err('Please enter a Voice ID.');            return; }
  if (!script)   { statusEl.innerHTML = err('Script is empty — generate one in Step 2 first.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Submitting…</span>';

  try {
    const videoId = await submitJob({ apiKey, avatarId, voiceId, script });
    statusEl.innerHTML = info(`Job submitted — Video ID: <code>${videoId}</code>`);
    progressCard.style.display = 'block';
    await pollUntilDone({ apiKey, videoId, container });
  } catch (e) {
    statusEl.innerHTML = err(escHtml(e.message));
    retryBtn.style.display = 'inline-flex';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Generate Video</span>';
  }
}

async function submitJob({ apiKey, avatarId, voiceId, script }) {
  const payload = {
    video_inputs: [{
      character: {
        type: 'avatar',
        avatar_id: avatarId,
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        input_text: script,
        voice_id: voiceId,
      },
    }],
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

async function pollUntilDone({ apiKey, videoId, container }) {
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
        const data   = await res.json();
        const status = data?.data?.status;
        const videoUrl = data?.data?.video_url;

        if (status === 'completed' && videoUrl) {
          cancelAnimationFrame(animFrame);
          progressBar.style.width = '100%';
          progressLabel.textContent = 'Done!';
          setTimeout(() => { progressCard.style.display = 'none'; }, 800);

          container.querySelector('#hg-video-player').src = videoUrl;
          container.querySelector('#hg-download-btn').href = videoUrl;
          resultCard.style.display = 'block';
          statusEl.innerHTML = `<div class="status-bar success">Video ready!</div>`;
          document.dispatchEvent(new CustomEvent('video-complete', { detail: { videoUrl, videoId } }));
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

const err  = (msg) => `<div class="status-bar error">${msg}</div>`;
const info = (msg) => `<div class="status-bar info">${msg}</div>`;

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
