/**
 * ai-client.js — Universal AI wrapper with automatic Gemini fallback
 *
 * Exposed as window.callAI and window.AI_PROVIDERS (non-module script).
 * Reads API keys from localStorage key 'yt_pipeline_settings'.
 *
 * Usage:
 *   const { text, inputTokens, outputTokens, provider } = await window.callAI({
 *     prompt,          // user message string
 *     systemPrompt,    // system string (optional)
 *     maxTokens,       // default 4096
 *     tools,           // array of Anthropic tool objects (optional)
 *     action,          // string label for cost tracking
 *     requiresWebSearch, // if true, adds web_search tool + beta header
 *   });
 */

(function () {
  'use strict';

  // ── Cost table (per 1M tokens, USD) ────────────────────────────────────────
  const COST_PER_MILLION = {
    'claude-opus-4-5':       { input: 15.00, output: 75.00 },
    'claude-sonnet-4-5':     { input:  3.00, output: 15.00 },
    'gemini-2.5-flash':      { input:  0.15, output:  0.60 },
  };

  window.AI_PROVIDERS = {
    anthropic: { name: 'Claude (Anthropic)', model: 'claude-opus-4-5' },
    gemini:    { name: 'Gemini Flash (Google)', model: 'gemini-2.5-flash' },
  };

  // ── Settings helper ─────────────────────────────────────────────────────────
  function _getSettings() {
    try { return JSON.parse(localStorage.getItem('yt_pipeline_settings') || '{}'); }
    catch { return {}; }
  }

  // ── Cost tracking ────────────────────────────────────────────────────────────
  const _SESSION_KEY = 'ai_client_session_cost';

  function recordUsage({ provider, model, inputTokens, outputTokens, action }) {
    const rates = COST_PER_MILLION[model] || { input: 0, output: 0 };
    const cost  = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;

    const session = JSON.parse(sessionStorage.getItem(_SESSION_KEY) || '{"total":0,"calls":[]}');
    session.total += cost;
    session.calls.push({ provider, model, inputTokens, outputTokens, cost, action, ts: Date.now() });
    sessionStorage.setItem(_SESSION_KEY, JSON.stringify(session));

    _updateCostDisplay(session.total);
  }

  function _updateCostDisplay(total) {
    const el = document.getElementById('aiCostDisplay');
    if (!el) return;
    el.textContent = `AI: $${total.toFixed(4)}`;
    el.title = 'Session AI cost (Anthropic + Gemini)';
  }

  // ── Fallback notification ────────────────────────────────────────────────────
  function _showFallbackNotification(reason) {
    const existing = document.getElementById('ai-fallback-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'ai-fallback-toast';
    toast.style.cssText = `
      position:fixed;bottom:20px;right:20px;z-index:99999;
      background:#1e293b;color:#f8fafc;padding:12px 18px;border-radius:8px;
      font-size:.85rem;max-width:340px;box-shadow:0 4px 20px rgba(0,0,0,.4);
      border-left:4px solid #f59e0b;line-height:1.5;
    `;
    toast.innerHTML = `
      <strong style="color:#f59e0b">⚡ Switched to Gemini Flash</strong><br>
      <span style="color:#94a3b8">${reason}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  }

  // ── Balance error detection ──────────────────────────────────────────────────
  function _isBalanceError(status, message) {
    if (status !== 400) return false;
    const m = (message || '').toLowerCase();
    return m.includes('credit') || m.includes('billing') || m.includes('quota');
  }

  // ── Anthropic call ───────────────────────────────────────────────────────────
  async function _callAnthropic({ prompt, systemPrompt, maxTokens, tools, requiresWebSearch }) {
    const s = _getSettings();
    const apiKey = s.claudeApiKey;
    if (!apiKey) throw Object.assign(new Error('No Anthropic API key configured.'), { isConfig: true });

    const headers = {
      'Content-Type':                         'application/json',
      'x-api-key':                            apiKey,
      'anthropic-version':                    '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (requiresWebSearch) {
      headers['anthropic-beta'] = 'web-search-2025-03-05';
    }

    const allTools = [...(tools || [])];
    if (requiresWebSearch) {
      allTools.push({ type: 'web_search_20250305', name: 'web_search' });
    }

    const body = {
      model:      window.AI_PROVIDERS.anthropic.model,
      max_tokens: maxTokens || 4096,
      messages:   [{ role: 'user', content: prompt }],
    };
    if (systemPrompt)     body.system = systemPrompt;
    if (allTools.length)  body.tools  = allTools;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      const err = Object.assign(new Error(`Anthropic error (${res.status}): ${msg}`), {
        status: res.status,
        apiMessage: msg,
        isBalanceError: _isBalanceError(res.status, msg),
      });
      throw err;
    }

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return {
      text,
      inputTokens:  data.usage?.input_tokens  || 0,
      outputTokens: data.usage?.output_tokens || 0,
      provider:     'anthropic',
      model:        window.AI_PROVIDERS.anthropic.model,
      raw:          data,
    };
  }

  // ── Gemini call ──────────────────────────────────────────────────────────────
  async function _callGemini({ prompt, systemPrompt, maxTokens }) {
    const s = _getSettings();
    const apiKey = s.geminiApiKey;
    if (!apiKey) throw Object.assign(new Error('No Gemini API key configured.'), { isConfig: true });

    const model = window.AI_PROVIDERS.gemini.model;
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = [{ role: 'user', parts: [{ text: prompt }] }];
    const body = {
      contents,
      tools: [{ googleSearch: {} }],
      generationConfig: { maxOutputTokens: maxTokens || 4096 },
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      throw new Error(`Gemini error (${res.status}): ${msg}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata || {};

    return {
      text,
      inputTokens:  usage.promptTokenCount    || 0,
      outputTokens: usage.candidatesTokenCount || 0,
      provider:     'gemini',
      model,
      raw:          data,
    };
  }

  // ── Public: callAI ───────────────────────────────────────────────────────────
  /**
   * @param {object} opts
   * @param {string}   opts.prompt
   * @param {string}  [opts.systemPrompt]
   * @param {number}  [opts.maxTokens=4096]
   * @param {Array}   [opts.tools]
   * @param {string}  [opts.action]          label for cost tracking
   * @param {boolean} [opts.requiresWebSearch]
   * @returns {Promise<{ text, inputTokens, outputTokens, provider, model, raw }>}
   */
  async function callAI(opts) {
    // Try Anthropic first
    try {
      const result = await _callAnthropic(opts);
      recordUsage({
        provider:     result.provider,
        model:        result.model,
        inputTokens:  result.inputTokens,
        outputTokens: result.outputTokens,
        action:       opts.action || 'unknown',
      });
      return result;
    } catch (err) {
      // If it's a balance/credit error, fall back to Gemini
      if (err.isBalanceError) {
        _showFallbackNotification('Anthropic credit limit reached. Using Gemini Flash for this request.');
      } else if (!err.isConfig) {
        // Non-balance, non-config Anthropic error — rethrow, don't fall back
        throw err;
      } else {
        // Config error (no key) — fall through to Gemini if Gemini key exists
        const s = _getSettings();
        if (!s.geminiApiKey) throw err;
      }
    }

    // Gemini fallback
    const result = await _callGemini(opts);
    recordUsage({
      provider:     result.provider,
      model:        result.model,
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
      action:       opts.action || 'unknown',
    });
    return result;
  }

  // ── Expose globals ───────────────────────────────────────────────────────────
  window.callAI        = callAI;
  window.recordUsage   = recordUsage;

  // Init cost display on load
  document.addEventListener('DOMContentLoaded', () => {
    const session = JSON.parse(sessionStorage.getItem(_SESSION_KEY) || '{"total":0}');
    _updateCostDisplay(session.total || 0);
  });

})();
