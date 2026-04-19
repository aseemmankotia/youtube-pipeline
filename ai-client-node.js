/**
 * ai-client-node.js — Node.js AI wrapper with Gemini fallback
 *
 * Tries Anthropic (Claude) first. Falls back to Gemini Flash automatically
 * when Anthropic returns a credit/balance error (status 400).
 *
 * Usage:
 *   const { callAI } = require('./ai-client-node.js');
 *   const text = await callAI({ prompt, systemPrompt, maxTokens, action });
 *
 * Keys are read from process.env at call time, so .env must be loaded first.
 */

'use strict';

const axios = require('axios');

function _keys() {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    gemini:    process.env.GEMINI_API_KEY    || '',
  };
}

function _isBalanceError(status, message) {
  if (status !== 400) return false;
  const m = (message || '').toLowerCase();
  return m.includes('credit') || m.includes('billing') || m.includes('balance') || m.includes('quota');
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function _callAnthropic({ prompt, systemPrompt, maxTokens, action }) {
  const { anthropic: apiKey } = _keys();
  if (!apiKey) return null; // no key → skip to Gemini

  const body = {
    model:      'claude-sonnet-4-20250514',
    max_tokens: maxTokens || 4000,
    messages:   [{ role: 'user', content: prompt }],
  };
  if (systemPrompt) body.system = systemPrompt;

  let resp;
  try {
    resp = await axios.post('https://api.anthropic.com/v1/messages', body, {
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      validateStatus: () => true, // handle all status codes manually
    });
  } catch (e) {
    throw new Error(`Anthropic network error: ${e.message}`);
  }

  const data = resp.data || {};

  if (resp.status !== 200) {
    const msg = data?.error?.message || `status ${resp.status}`;
    if (_isBalanceError(resp.status, msg)) {
      console.log('⚠️  Anthropic credits low — trying Gemini fallback…');
      return null; // fall through to Gemini
    }
    throw new Error(`Anthropic error (${resp.status}): ${msg}`);
  }

  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  console.log(`   ✓ [Claude] ${action}: ${text.length} chars`);
  return text;
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function _callGemini({ prompt, systemPrompt, maxTokens, action }) {
  const { gemini: apiKey } = _keys();
  if (!apiKey) return null; // no key

  const model     = 'gemini-2.5-flash';
  const url       = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const outTokens = Math.min((maxTokens || 4000) * 2, 8192);
  const userText  = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  let fullText = '';
  let contents = [{ role: 'user', parts: [{ text: userText }] }];
  const MAX_PASSES = 3;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let resp;
    try {
      resp = await axios.post(url, {
        contents,
        generationConfig: { maxOutputTokens: outTokens, temperature: 0.7 },
      }, {
        headers:        { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      });
    } catch (e) {
      throw new Error(`Gemini network error: ${e.message}`);
    }

    const data = resp.data || {};

    if (resp.status !== 200) {
      const msg = data?.error?.message || `status ${resp.status}`;
      throw new Error(`Gemini error (${resp.status}): ${msg}`);
    }

    const parts  = data.candidates?.[0]?.content?.parts || [];
    const chunk  = parts.filter(p => p.text).map(p => p.text).join('');
    const finish = data.candidates?.[0]?.finishReason || '';

    fullText += chunk;
    console.log(`   [Gemini pass ${pass + 1}] ${chunk.length} chars, finishReason=${finish}`);

    if (finish !== 'MAX_TOKENS') break;

    if (pass < MAX_PASSES - 1) {
      console.log('   Gemini MAX_TOKENS — continuing…');
      contents = [
        { role: 'user',  parts: [{ text: userText  }] },
        { role: 'model', parts: [{ text: fullText  }] },
        { role: 'user',  parts: [{ text: 'Continue exactly from where you left off. Do not repeat anything.' }] },
      ];
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 200) {
    console.warn(`   ⚠️  Gemini response may be truncated: only ${wordCount} words`);
  }

  console.log(`   ✓ [Gemini] ${action}: ${fullText.length} chars`);
  return fullText;
}

// ── Public: callAI ────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string}   opts.prompt
 * @param {string}  [opts.systemPrompt='']
 * @param {number}  [opts.maxTokens=4000]
 * @param {string}  [opts.action='unknown']
 * @returns {Promise<string>}
 */
async function callAI({ prompt, systemPrompt = '', maxTokens = 4000, action = 'unknown' }) {
  const { anthropic, gemini } = _keys();

  if (!anthropic && !gemini) {
    throw new Error(
      'No AI provider available.\n' +
      'Add to your .env file:\n' +
      '  ANTHROPIC_API_KEY=sk-ant-…\n' +
      '  GEMINI_API_KEY=AIza-…\n' +
      '💡 Free Gemini key at: aistudio.google.com'
    );
  }

  // Try Anthropic first
  if (anthropic) {
    const text = await _callAnthropic({ prompt, systemPrompt, maxTokens, action });
    if (text !== null) return text;
  }

  // Gemini fallback (or primary if no Anthropic key)
  if (gemini) {
    const text = await _callGemini({ prompt, systemPrompt, maxTokens, action });
    if (text !== null) return text;
  }

  throw new Error(
    'Both AI providers failed or have no API keys.\n' +
    'Add to your .env:\n' +
    '  ANTHROPIC_API_KEY=sk-ant-…\n' +
    '  GEMINI_API_KEY=AIza-…\n' +
    '💡 Free Gemini key at: aistudio.google.com'
  );
}

module.exports = { callAI };
