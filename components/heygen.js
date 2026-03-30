/**
 * HeyGen Video Generation Component — Step 4
 *
 * Sends the script to HeyGen's v2 video generation API, polls for completion,
 * and presents a download + preview when ready.
 *
 * Audio note:
 *   ElevenLabs generates a local blob URL — not publicly reachable by HeyGen's
 *   servers. By default this component uses HeyGen's own TTS with the script
 *   text. If you have uploaded your ElevenLabs audio to a public host (S3,
 *   Cloudinary, etc.), paste that URL in the "Public Audio URL" field to use it
 *   instead.
 */

const AVATAR_STYLES = ['normal', 'circle', 'closeUp'];

const DIMENSIONS = [
  { label: '16:9 HD (1280×720)',  w: 1280, h: 720  },
  { label: '9:16 Vertical (720×1280)', w: 720,  h: 1280 },
  { label: '1:1 Square (720×720)', w: 720,  h: 720  },
];

const POLL_INTERVAL_MS = 10_000;

export function renderHeyGen(container) {
  container.innerHTML = `
    <div class="card">
      <h2>HeyGen Video Generation</h2>

      <div class="form-row">
        <div class="form-group">
          <label for="hg-api-key">HeyGen API Key</label>
          <input type="password" id="hg-api-key" placeholder="Your HeyGen API key…" autocomplete="off" />
        </div>
        <div class="form-group">
          <label for="hg-avatar-id">Avatar ID</label>
          <input type="text" id="hg-avatar-id" placeholder="e.g. josh_lite3_20230714" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="hg-voice-id">
            HeyGen Voice ID
            <span style="color:var(--muted);font-weight:400"> — used when no audio URL is provided</span>
          </label>
          <input type="text" id="hg-voice-id" placeholder="e.g. 1bd001e7e50f421d891986aad5158bc8" />
        </div>
        <div class="form-group">
          <label for="hg-audio-url">
            Public Audio URL
            <span style="color:var(--muted);font-weight:400"> — overrides HeyGen TTS</span>
          </label>
          <input type="text" id="hg-audio-url" placeholder="https://… (ElevenLabs audio must be public)" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="hg-dimension">Dimensions</label>
          <select id="hg-dimension">
            ${DIMENSIONS.map((d, i) => `<option value="${i}">${d.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="hg-avatar-style">Avatar Style</label>
          <select id="hg-avatar-style">
            ${AVATAR_STYLES.map(s => `<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="hg-script">Script Text</label>
        <textarea id="hg-script" rows="6"
          placeholder="Script auto-filled from Step 3. You can also paste manually…"></textarea>
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

  // Accept script + audio URL piped from earlier steps
  container._setScript = (script) => {
    container.querySelector('#hg-script').value = script || '';
  };
  container._setAudioUrl = (url) => {
    if (url) container.querySelector('#hg-audio-url').value = url;
  };

  const btn = container.querySelector('#generate-video-btn');
  btn.addEventListener('click', () => startGeneration(container));

  container.querySelector('#hg-retry-btn').addEventListener('click', () => {
    container.querySelector('#hg-retry-btn').style.display = 'none';
    startGeneration(container);
  });

  // Listen for audio-complete event from ElevenLabs (auto-pipeline)
  document.addEventListener('audio-complete', (e) => {
    const { script, audioUrl } = e.detail || {};
    if (script) container._setScript(script);
    // audioUrl is a blob URL — not publicly accessible, so we don't auto-fill
    // the audio URL field. User must upload it manually if they want to use it.
    const apiKey   = container.querySelector('#hg-api-key').value.trim();
    const avatarId = container.querySelector('#hg-avatar-id').value.trim();
    if (apiKey && avatarId) {
      startGeneration(container);
    }
  });
}

async function startGeneration(container) {
  const apiKey    = container.querySelector('#hg-api-key').value.trim();
  const avatarId  = container.querySelector('#hg-avatar-id').value.trim();
  const voiceId   = container.querySelector('#hg-voice-id').value.trim();
  const audioUrl  = container.querySelector('#hg-audio-url').value.trim();
  const dimIdx    = parseInt(container.querySelector('#hg-dimension').value);
  const style     = container.querySelector('#hg-avatar-style').value;
  const script    = container.querySelector('#hg-script').value.trim();

  const statusEl   = container.querySelector('#hg-status');
  const progressCard = container.querySelector('#hg-progress-card');
  const resultCard = container.querySelector('#hg-result-card');
  const btn        = container.querySelector('#generate-video-btn');
  const retryBtn   = container.querySelector('#hg-retry-btn');

  statusEl.innerHTML = '';
  progressCard.style.display = 'none';
  resultCard.style.display = 'none';
  retryBtn.style.display = 'none';

  if (!apiKey) {
    statusEl.innerHTML = `<div class="status-bar error">Please enter your HeyGen API key.</div>`;
    return;
  }
  if (!avatarId) {
    statusEl.innerHTML = `<div class="status-bar error">Please enter an Avatar ID.</div>`;
    return;
  }
  if (!script) {
    statusEl.innerHTML = `<div class="status-bar error">Script is empty — generate one in Step 2 first.</div>`;
    return;
  }
  if (!audioUrl && !voiceId) {
    statusEl.innerHTML = `<div class="status-bar error">Provide either a HeyGen Voice ID or a public Audio URL.</div>`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span><span>Submitting…</span>';

  try {
    const dim = DIMENSIONS[dimIdx];
    const videoId = await submitHeyGenJob({ apiKey, avatarId, voiceId, audioUrl, script, dim, style });

    statusEl.innerHTML = `<div class="status-bar info">Job submitted. Video ID: <code>${videoId}</code></div>`;
    progressCard.style.display = 'block';

    await pollUntilDone({ apiKey, videoId, container });

  } catch (err) {
    statusEl.innerHTML = `<div class="status-bar error">${escHtml(err.message)}</div>`;
    retryBtn.style.display = 'inline-flex';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Generate Video</span>';
  }
}

async function submitHeyGenJob({ apiKey, avatarId, voiceId, audioUrl, script, dim, style }) {
  const voice = audioUrl
    ? { type: 'audio', audio_url: audioUrl }
    : { type: 'text', input_text: script, voice_id: voiceId };

  const payload = {
    video_inputs: [{
      character: {
        type: 'avatar',
        avatar_id: avatarId,
        avatar_style: style,
      },
      voice,
      background: {
        type: 'color',
        value: '#1a1a1a',
      },
    }],
    dimension: { width: dim.w, height: dim.h },
    caption: false,
  };

  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.message || err?.error || res.statusText;
    throw new Error(`HeyGen submit error (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const videoId = data?.data?.video_id || data?.video_id;
  if (!videoId) throw new Error('HeyGen did not return a video_id. Check your API key and avatar ID.');
  return videoId;
}

async function pollUntilDone({ apiKey, videoId, container }) {
  const progressBar   = container.querySelector('#hg-progress-bar');
  const progressLabel = container.querySelector('#hg-progress-label');
  const progressCard  = container.querySelector('#hg-progress-card');
  const resultCard    = container.querySelector('#hg-result-card');
  const statusEl      = container.querySelector('#hg-status');
  const retryBtn      = container.querySelector('#hg-retry-btn');

  const startTime = Date.now();
  const MAX_WAIT_MS = 20 * 60 * 1000; // 20 minutes hard timeout

  // Animate progress bar — estimated 10 min render, accelerates to 90% then stalls
  let animFrame;
  function animateBar() {
    const elapsed = Date.now() - startTime;
    const estimated = 10 * 60 * 1000;
    // Ease toward 90% over the estimated time
    const raw = Math.min(elapsed / estimated, 1);
    const pct = Math.round(raw * 90);
    progressBar.style.width = pct + '%';
    const secs = Math.round(elapsed / 1000);
    const mins = Math.floor(secs / 60);
    const s    = secs % 60;
    progressLabel.textContent = `Elapsed: ${mins}m ${s}s — HeyGen is rendering your video…`;
    if (pct < 90) animFrame = requestAnimationFrame(animateBar);
  }
  animFrame = requestAnimationFrame(animateBar);

  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() - startTime > MAX_WAIT_MS) {
        cancelAnimationFrame(animFrame);
        reject(new Error('Timed out after 20 minutes waiting for HeyGen.'));
        return;
      }

      try {
        const res = await fetch(
          `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
          { headers: { 'X-Api-Key': apiKey } }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(`Poll error (${res.status}): ${err?.message || res.statusText}`);
        }

        const data = await res.json();
        const status   = data?.data?.status;
        const videoUrl = data?.data?.video_url;

        if (status === 'completed' && videoUrl) {
          cancelAnimationFrame(animFrame);
          progressBar.style.width = '100%';
          progressLabel.textContent = 'Done!';

          setTimeout(() => { progressCard.style.display = 'none'; }, 800);

          container.querySelector('#hg-video-player').src = videoUrl;
          container.querySelector('#hg-download-btn').href = videoUrl;
          resultCard.style.display = 'block';

          statusEl.innerHTML = `<div class="status-bar success">Video generated successfully!</div>`;

          document.dispatchEvent(new CustomEvent('video-complete', { detail: { videoUrl, videoId } }));
          resolve(videoUrl);

        } else if (status === 'failed') {
          cancelAnimationFrame(animFrame);
          const reason = data?.data?.error?.message || 'Unknown error';
          reject(new Error(`HeyGen rendering failed: ${reason}`));
          retryBtn.style.display = 'inline-flex';

        } else {
          // still processing — wait and poll again
          setTimeout(poll, POLL_INTERVAL_MS);
        }

      } catch (err) {
        cancelAnimationFrame(animFrame);
        reject(err);
      }
    };

    setTimeout(poll, POLL_INTERVAL_MS);
  });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
