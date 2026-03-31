/**
 * youtube-auth.js
 * One-time OAuth 2.0 setup for YouTube Data API v3.
 *
 * Usage:
 *   node youtube-auth.js
 *
 * Prerequisites:
 *   - client_secrets.json in the same directory (downloaded from Google Cloud Console)
 *
 * What it does:
 *   1. Reads client_secrets.json
 *   2. Starts a local server on http://localhost:8080
 *   3. Opens the Google OAuth consent page in your browser
 *   4. Captures the authorization code from the redirect
 *   5. Exchanges it for access + refresh tokens
 *   6. Saves refresh token to youtube-token.json
 */

const http  = require('http');
const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const SECRETS_FILE = path.join(__dirname, 'client_secrets.json');
const TOKEN_FILE   = path.join(__dirname, 'youtube-token.json');
const REDIRECT_URI = 'http://localhost:8080/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
].join(' ');

// ── Main ──────────────────────────────────────────────────────────────────────

(async function main() {
  // 1. Read client secrets
  if (!fs.existsSync(SECRETS_FILE)) {
    console.error(`\nError: ${SECRETS_FILE} not found.`);
    console.error('Download it from Google Cloud Console:');
    console.error('  APIs & Services → Credentials → OAuth 2.0 Client → Download JSON\n');
    process.exit(1);
  }

  let secrets;
  try {
    const raw = fs.readFileSync(SECRETS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // Support both "web" and "installed" app credential formats
    secrets = parsed.web || parsed.installed;
    if (!secrets || !secrets.client_id || !secrets.client_secret) {
      throw new Error('Missing client_id or client_secret in client_secrets.json');
    }
  } catch (e) {
    console.error(`\nError reading ${SECRETS_FILE}: ${e.message}\n`);
    process.exit(1);
  }

  const { client_id, client_secret } = secrets;

  // 2. Build consent URL
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new url.URLSearchParams({
    client_id,
    redirect_uri:   REDIRECT_URI,
    response_type:  'code',
    scope:          SCOPES,
    access_type:    'offline',
    prompt:         'consent',   // force refresh_token to be returned
  }).toString();

  // 3. Start local server to catch the redirect
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);

      if (parsed.pathname !== '/oauth2callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      if (parsed.query.error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Authorization denied.</h2><p>You can close this tab.</p>');
        server.close();
        reject(new Error(`OAuth error: ${parsed.query.error}`));
        return;
      }

      const authCode = parsed.query.code;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body style="font-family:sans-serif;padding:40px;background:#0f0f0f;color:#e8e8e8;">
          <h2 style="color:#4caf50;">Authorization successful!</h2>
          <p>You can close this tab and return to your terminal.</p>
        </body></html>
      `);
      server.close();
      resolve(authCode);
    });

    server.listen(8080, '127.0.0.1', () => {
      console.log('\nLocal server started on http://localhost:8080');
      console.log('\nOpening Google authorization page in your browser…');
      console.log('(If it does not open automatically, paste this URL into your browser:)');
      console.log('\n' + authUrl + '\n');
      openBrowser(authUrl);
    });

    server.on('error', (e) => {
      reject(new Error(`Could not start local server: ${e.message}`));
    });
  });

  console.log('Authorization code received. Exchanging for tokens…');

  // 4. Exchange code for tokens
  const tokens = await exchangeCodeForTokens({ client_id, client_secret, code });

  if (!tokens.refresh_token) {
    console.error('\nWarning: No refresh_token returned.');
    console.error('This can happen if you previously authorized this app.');
    console.error('Go to https://myaccount.google.com/permissions and revoke access, then re-run.\n');
    process.exit(1);
  }

  // 5. Save token
  const tokenData = {
    refresh_token:  tokens.refresh_token,
    access_token:   tokens.access_token,
    token_type:     tokens.token_type,
    expires_in:     tokens.expires_in,
    scope:          tokens.scope,
    created_at:     new Date().toISOString(),
  };

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));
  console.log(`\nSuccess! Refresh token saved to ${TOKEN_FILE}`);
  console.log('Keep this file safe — never commit it to git.\n');
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function exchangeCodeForTokens({ client_id, client_secret, code }) {
  return new Promise((resolve, reject) => {
    const body = new url.URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri:   REDIRECT_URI,
      grant_type:     'authorization_code',
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Token exchange failed: ${parsed.error} — ${parsed.error_description}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse token response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function openBrowser(url) {
  const { execSync } = require('child_process');
  const platform = process.platform;
  try {
    if (platform === 'darwin')      execSync(`open "${url}"`);
    else if (platform === 'win32')  execSync(`start "" "${url}"`);
    else                            execSync(`xdg-open "${url}"`);
  } catch (_) {
    // Browser open failed — user can copy-paste the URL manually
  }
}
