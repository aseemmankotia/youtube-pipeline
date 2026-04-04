/**
 * Token usage tracking and cost monitoring.
 * Imported by topics.js, script.js, heygen.js, and app.js.
 *
 * Pricing (claude-sonnet-4):
 *   Input:  $3  / 1M tokens  →  $0.000003 / token
 *   Output: $15 / 1M tokens  →  $0.000015 / token
 */

const COST_IN  = 3  / 1_000_000;
const COST_OUT = 15 / 1_000_000;
const KEY      = 'pipeline_token_usage';

// Estimated cost of a topic search (used for cache savings display)
export const TOPIC_SEARCH_COST = 0.05;

export function calcCost(inputTokens, outputTokens) {
  return (inputTokens * COST_IN) + (outputTokens * COST_OUT);
}

export function fmtCost(n) {
  if (n < 0.005) return '<$0.01';
  return '$' + n.toFixed(2);
}

// ── Storage ───────────────────────────────────────────────────────────────────

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (!d.savings) d.savings = [];
      return d;
    }
  } catch {}
  return { entries: [], savings: [] };
}

function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Call after every successful Claude API response.
 * action: 'topic_search' | 'script_gen' | 'script_shorten' | 'script_expand' | 'slide_preview'
 */
export function trackUsage(action, inputTokens, outputTokens, meta = {}) {
  const data = load();
  const cost = calcCost(inputTokens, outputTokens);
  data.entries.push({
    action,
    input_tokens:  inputTokens,
    output_tokens: outputTokens,
    cost,
    date:      todayStr(),
    timestamp: new Date().toISOString(),
    ...meta,
  });
  save(data);
  document.dispatchEvent(new CustomEvent('usage-updated'));
  return cost;
}

/** Call when a cache hit avoids an API call. */
export function trackCacheSaving(action, savedCost, meta = {}) {
  const data = load();
  data.savings.push({
    action,
    saved:     savedCost,
    date:      todayStr(),
    timestamp: new Date().toISOString(),
    ...meta,
  });
  save(data);
  document.dispatchEvent(new CustomEvent('usage-updated'));
}

// ── Read ──────────────────────────────────────────────────────────────────────

function filterDate(arr, dateStr) { return arr.filter(e => e.date === dateStr); }

export function getTodayEntries()  { return filterDate(load().entries,  todayStr()); }
export function getTodayCost()     { return getTodayEntries().reduce((s, e) => s + e.cost, 0); }
export function getTodaySavings()  { return filterDate(load().savings,  todayStr()).reduce((s, e) => s + e.saved, 0); }
export function getAllTimeSavings() { return load().savings.reduce((s, e) => s + e.saved, 0); }

export function getThisWeekCost() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutStr = cutoff.toISOString().slice(0, 10);
  return load().entries.filter(e => e.date >= cutStr).reduce((s, e) => s + e.cost, 0);
}

export function getAllTimeCost() { return load().entries.reduce((s, e) => s + e.cost, 0); }

export function groupByAction(entries) {
  const map = {};
  for (const e of entries) {
    if (!map[e.action]) map[e.action] = { calls: 0, cost: 0 };
    map[e.action].calls++;
    map[e.action].cost += e.cost;
  }
  return map;
}

export function resetToday() {
  const data  = load();
  const today = todayStr();
  data.entries  = data.entries.filter(e => e.date !== today);
  data.savings  = data.savings.filter(s => s.date !== today);
  save(data);
  document.dispatchEvent(new CustomEvent('usage-updated'));
}
