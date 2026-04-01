/**
 * Google Sheets Logging Utility
 * Appends a row to a "Pipeline Log" sheet after each generation/upload.
 * Uses the same OAuth refresh token as the YouTube uploader.
 *
 * Note: The refresh token must include the Sheets scope.
 * Re-run `node youtube-auth.js` if you generated your token before Sheets
 * support was added.
 */

import { getSettings } from './settings.js';

const SHEET_NAME = 'Pipeline Log';
const COLUMNS    = ['Date', 'Topic', 'Script Excerpt', 'HeyGen Video URL', 'YouTube URL', 'Status'];

export async function logToSheets({ topic, scriptExcerpt, heygenVideoUrl, youtubeUrl, status }) {
  const { sheetsId, ytClientId, ytClientSecret, ytRefreshToken } = getSettings();
  if (!sheetsId || !ytClientId || !ytClientSecret || !ytRefreshToken) return; // silently skip

  try {
    const accessToken = await getAccessToken(ytClientId, ytClientSecret, ytRefreshToken);
    await ensureSheetExists(sheetsId, accessToken);
    await appendRow(sheetsId, accessToken, [
      new Date().toLocaleString(),
      topic || '',
      (scriptExcerpt || '').slice(0, 500),
      heygenVideoUrl || '',
      youtubeUrl || '',
      status || '',
    ]);
  } catch (e) {
    // Non-fatal — log to console but don't disrupt the pipeline
    console.warn('[Sheets] Logging failed:', e.message);
  }
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
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
    throw new Error(data.error_description || data.error || 'Token refresh failed');
  }
  return data.access_token;
}

async function ensureSheetExists(sheetsId, accessToken) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Cannot access spreadsheet (${res.status}). Check Sheet ID and Sheets API scope.`);

  const data   = await res.json();
  const sheets = data.sheets || [];
  const exists = sheets.some(s => s.properties.title === SHEET_NAME);

  if (!exists) {
    // Create the "Pipeline Log" sheet
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
    });
    // Write header row
    await appendRow(sheetsId, accessToken, COLUMNS);
  }
}

async function appendRow(sheetsId, accessToken, values) {
  const range = encodeURIComponent(`${SHEET_NAME}!A1`);
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
    }
  );
}
