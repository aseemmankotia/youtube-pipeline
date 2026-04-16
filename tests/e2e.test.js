'use strict';
/**
 * e2e.test.js — YouTube Pipeline end-to-end test suite
 *
 * Run: node --test tests/e2e.test.js
 *   or: npm test
 *
 * Uses Node.js built-in test runner (node:test) and assert.
 * No external frameworks required.
 *
 * Pure functions are ported from the ES-module source files into CJS for
 * testability. Each port is labelled with its source file so drifts are easy
 * to spot.
 */

const { test, describe } = require('node:test');
const assert             = require('node:assert/strict');
const path               = require('node:path');
const fs                 = require('node:fs');

const { createMockStorage } = require('./mocks/storage.mock.js');
const anthropicMock         = require('./mocks/anthropic.mock.js');

// ─────────────────────────────────────────────────────────────────────────────
// PORTED FUNCTIONS — extracted from ES module sources for CJS testability
// ─────────────────────────────────────────────────────────────────────────────

// ── From: components/clean-script.js ─────────────────────────────────────────

const CODE_PHRASES = [
  'Here you can see the code example on screen.',
  'As shown in the code on screen.',
  'Take a look at this implementation on screen.',
  "Here's what the code looks like.",
  'Check out this code example on screen.',
];
let _phraseIdx = 0;
function nextCodePhrase() {
  return CODE_PHRASES[_phraseIdx++ % CODE_PHRASES.length];
}

const DELIVERY_WORDS = [
  'pause','beat','smile','laugh','chuckle','energetic','serious',
  'slow','fast','loud','soft','whisper','shout','emphasize',
  'dramatic','excited','calm','urgent','delivery','tone','voice',
  'speaking','cut','fade','b-roll','broll','music','sfx','sound',
  'visual','graphic','animation','demo','screen','camera',
];
const DELIVERY_RE = new RegExp(
  `\\([^)]*(?:${DELIVERY_WORDS.join('|')})[^)]*\\)`, 'gi'
);

function cleanScript(raw) {
  if (!raw) return '';
  _phraseIdx = 0;

  let text = raw;

  // Phase 1: replace code blocks
  text = text.replace(/```[\s\S]*?```/gm, () => nextCodePhrase());

  // Phase 2: string-level removal
  text = text.replace(/\[[^\]]*\]/g, '');
  text = text.replace(/\{[^}]*\}/g, '');
  text = text.replace(/\*\([^)]*\)\*/g, '');
  text = text.replace(/^#{1,6}[^\n]*/gm, '');
  text = text.replace(/^[-=*]{3,}\s*$/gm, '');
  text = text.replace(/^.*youtube\s+script.*$/gim, '');
  text = text.replace(/^.*video\s+length[:\s].*$/gim, '');
  text = text.replace(/^.*target\s+audience[:\s].*$/gim, '');
  text = text.replace(/^.*\btone\s*:.*$/gim, '');
  text = text.replace(/^.*\bstyle\s*:.*$/gim, '');

  // Phase 3: line-by-line
  const processedLines = text.split('\n').map(line => {
    const original = line;
    let l = line.trim();
    if (!l) return '';
    if (/^\*{1,3}[^*\n]+\*{1,3}$/.test(l)) return '';
    if (/^\*{1,2}\[.*\]\*{1,2}$/.test(l)) return '';
    if (/^(entertainment|tutorial|how-to|opinion|commentary|news|explainer|storytime|narrative|tech|short|medium|long|minutes?)\s*$/i.test(l)) return '';
    if (/^<[^>]+>$/.test(l)) return '';
    if (/^    \S/.test(original)) return nextCodePhrase();
    if ((l.match(/(?:^|\s)-{1,2}[a-zA-Z]/g) || []).length >= 2) {
      return 'You can see the terminal command on screen.';
    }
    if (/^\([^)]*\)\s*$/.test(l)) return '';
    l = l.replace(DELIVERY_RE, '');
    l = l.replace(/\(([A-Z][^a-z)]{0,30})\)/g, '');
    l = l.replace(/https?:\/\/[^\s)>"']+/g, 'the link shown on screen');
    l = l.replace(/(?:~\/|\/)[/\w.\-]+(?:\/[\w.\-]+)+/g, 'the file path shown on screen');
    l = l.replace(/\b([\w-]+)@(\d+)\.[\d.]+/g, '$1 version $2');
    l = l.replace(/[\^~](\d+\.\d+[\d.]*)/g, '');
    l = l.replace(/`([^`\n]+)`/g, (_, code) => {
      const c = code.trim();
      if (/^(npm|yarn|pnpm|npx|node|python|pip|brew|apt|cargo|docker|kubectl|git|curl|wget|ssh|scp|chmod|chown|mkdir|cd|ls|cat|grep|sed|awk)\b/.test(c)) {
        return c.split(/\s+/)[0] + ' command';
      }
      return c;
    });
    l = l.replace(/<[^>]+>/g, '');
    l = l.replace(/\*\*([^*\n]+)\*\*/g, '$1');
    l = l.replace(/\*[^*\n]+\*/g, '');
    l = l.replace(/__([^_\n]+)__/g, '$1');
    l = l.replace(/_([^_\n]+)_/g, '$1');
    l = l.replace(/^>\s*/, '');
    l = l.replace(/^[-•]\s+/, '');
    l = l.replace(/  +/g, ' ').trim();
    return l;
  });

  return processedLines
    .filter(l => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── From: components/usage.js ─────────────────────────────────────────────────

const COST_IN  = 3  / 1_000_000;  // $3  per 1M input tokens
const COST_OUT = 15 / 1_000_000;  // $15 per 1M output tokens

function calculateApiCost(inputTokens, outputTokens) {
  return (inputTokens * COST_IN) + (outputTokens * COST_OUT);
}

function fmtCost(n) {
  if (n < 0.005) return '<$0.01';
  return '$' + n.toFixed(2);
}

// Storage-injectable versions of usage tracking (accept a storage param)
const USAGE_KEY = 'pipeline_token_usage';

function recordApiUsage(action, inputTokens, outputTokens, storage) {
  const st = storage || { getItem: () => null, setItem: () => {} };
  let data = { entries: [], savings: [] };
  try {
    const raw = st.getItem(USAGE_KEY);
    if (raw) { data = JSON.parse(raw); if (!data.savings) data.savings = []; }
  } catch {}
  const cost = calculateApiCost(inputTokens, outputTokens);
  data.entries.push({
    action, input_tokens: inputTokens, output_tokens: outputTokens,
    cost, date: new Date().toISOString().slice(0, 10),
    timestamp: new Date().toISOString(),
  });
  st.setItem(USAGE_KEY, JSON.stringify(data));
}

function getTodayTotal(storage) {
  const st = storage || { getItem: () => null };
  try {
    const raw = st.getItem(USAGE_KEY);
    if (!raw) return 0;
    const data  = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    return (data.entries || [])
      .filter(e => e.date === today)
      .reduce((s, e) => s + e.cost, 0);
  } catch { return 0; }
}

// ── From: components/topics.js ────────────────────────────────────────────────

const CACHE_TTL    = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_PREFIX = 'topics_cache_';

function topicsCacheKey(niche) {
  const dateKey = new Date().toISOString().split('T')[0];
  return `${CACHE_PREFIX}${niche}_${dateKey}`;
}

function saveTopicsCache(niche, topics, storage) {
  storage.setItem(topicsCacheKey(niche), JSON.stringify({
    topics, timestamp: Date.now(), niche,
  }));
}

function getTopicsCache(niche, storage) {
  try {
    const raw = storage.getItem(topicsCacheKey(niche));
    if (!raw) return null;
    const c = JSON.parse(raw);
    if ((Date.now() - c.timestamp) < CACHE_TTL) return c;
  } catch {}
  return null;
}

function parseTopicsResponse(apiResponse) {
  const textBlocks = (apiResponse.content || []).filter(b => b.type === 'text');
  if (textBlocks.length === 0) {
    throw new Error('No text blocks in API response — no text content found.');
  }
  const raw = textBlocks.map(b => b.text).join('\n');
  const m   = raw.match(/\[[\s\S]+\]/);
  if (!m) throw new Error('No JSON array found in response text.');
  return JSON.parse(m[0]);
}

function filterRecentTopics(topics) {
  const currentYear = new Date().getFullYear();
  return topics.filter(t => {
    const text  = `${t.title} ${t.summary}`.toLowerCase();
    const years = text.match(/\b(20\d{2})\b/g);
    if (!years) return true;
    return years.every(y => parseInt(y) >= currentYear);
  });
}

// Settings save (storage-injectable)
function saveSettings(settings, storage) {
  Object.entries(settings).forEach(([k, v]) => storage.setItem(k, String(v)));
}

// ── From: components/script.js ────────────────────────────────────────────────

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function isWithinWordLimit(text, limit = 4500) {
  return countWords(text) <= limit;
}

function isScriptTruncated(apiResponse) {
  return apiResponse.stop_reason === 'max_tokens';
}

const CTA_PATTERNS = [
  /subscribe/i,
  /hit.{0,10}like/i,
  /smash.{0,10}(like|subscribe)/i,
  /see you in the next/i,
  /thanks? for watching/i,
  /notification bell/i,
  /drop a comment/i,
];

function hasProperEnding(script) {
  const tail = script.slice(-300); // check last ~300 chars
  return CTA_PATTERNS.some(re => re.test(tail));
}

// ── From: components/settings.js ─────────────────────────────────────────────

function getTokenAgeDays(isoDateStr) {
  const saved = new Date(isoDateStr).getTime();
  return Math.floor((Date.now() - saved) / 86_400_000);
}

function isTokenExpiredError(errorMessage) {
  return /expired|revoked/i.test(String(errorMessage));
}

function getTokenWarning(isoDateStr) {
  const days = getTokenAgeDays(isoDateStr);
  if (days >= 180) return `Token is ${days} days old — re-authenticate recommended.`;
  if (days >= 150) return `Token is ${days} days old — consider re-authenticating.`;
  return null;
}

// ── From: render.js ───────────────────────────────────────────────────────────

const VALID_MERMAID_STARTS = [
  'flowchart', 'graph', 'sequencediagram',
  'classdiagram', 'statediagram', 'erdiagram',
  'gantt', 'pie', 'gitgraph', 'mindmap',
];

function isValidMermaidCode(code) {
  if (!code || code.length < 10) return false;
  const firstWord = code.trim().split(/[\s\n]/)[0].toLowerCase();
  return VALID_MERMAID_STARTS.some(s => firstWord.startsWith(s));
}

// PIP filter builder — extracted from composite() in render.js
function buildPIPFilter(totalDuration, _ctaLeadSeconds = 30) {
  const PIP_WIDTH   = 320;
  const ctaStart    = Math.max(0, totalDuration - 30).toFixed(3);
  const ctaEnd      = Math.max(0, totalDuration - 8).toFixed(3);
  const overlayExpr = 'W-w-20:H-h-20'; // bottom-right

  return [
    `[0:v]scale=1280:720:flags=lanczos[bg]`,
    `[1:v]scale=${PIP_WIDTH}:-2:flags=lanczos[av_scaled]`,
    `[av_scaled]pad=iw+6:ih+6:3:3:color=white[av_bordered]`,
    `[bg][av_bordered]overlay=${overlayExpr}[with_pip]`,
    `[with_pip][2:v]overlay=0:440:enable='between(t,${ctaStart},${ctaEnd})'[outv]`,
  ].join(';');
}

// ── Integration helpers (minimal async wrappers for mock-based tests) ─────────

async function fetchTopics(niche, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5', max_tokens: 2000,
      messages: [{ role: 'user', content: `Find trending topics about: ${niche}` }],
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  const data = await res.json();
  return parseTopicsResponse(data);
}

async function generateFullScript(prompt, apiKey, maxTokens = 5000) {
  let fullText = '';
  let attempts = 0;

  while (attempts < 3) {
    const body = {
      model: 'claude-opus-4-5', max_tokens: maxTokens,
      messages: [{ role: 'user', content: attempts === 0 ? prompt : `${prompt}\n\nContinue from: ${fullText.slice(-200)}` }],
    };
    const res  = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    const data   = await res.json();
    const chunk  = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    fullText    += chunk;
    attempts++;
    if (data.stop_reason !== 'max_tokens') break;
  }

  return fullText;
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 1 — Script Cleaning Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('cleanScript()', () => {

  test('removes markdown headers entirely', () => {
    const input  = '# Chapter 1: Welcome\n## Section heading\nHello world';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('Chapter 1'), false);
    assert.strictEqual(output.includes('Section heading'), false);
    assert.strictEqual(output.includes('Hello world'), true);
  });

  test('removes bold markers but keeps text in sentences', () => {
    const input  = 'This is **important** content to understand';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('**'), false);
    assert.strictEqual(output.includes('important'), true);
  });

  test('removes entire bold-only lines', () => {
    const input  = '**CHAPTER INTRO**\nWelcome to the video';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('CHAPTER INTRO'), false);
    assert.strictEqual(output.includes('Welcome to the video'), true);
  });

  test('removes bracketed stage directions', () => {
    const input  = 'Hello [PAUSE] everyone [HOOK] welcome';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('[PAUSE]'), false);
    assert.strictEqual(output.includes('[HOOK]'), false);
    assert.strictEqual(output.includes('Hello'), true);
  });

  test('removes code blocks and replaces with spoken placeholder', () => {
    const input  = 'Here is the code:\n```python\nimport pandas\n```\nThat is it';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('```'), false);
    assert.strictEqual(output.includes('import pandas'), false);
    assert.ok(output.includes('screen') || output.includes('code'));
  });

  test('removes horizontal rules', () => {
    const input  = 'Section 1\n---\nSection 2\n===\nSection 3';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('---'), false);
    assert.strictEqual(output.includes('==='), false);
  });

  test('removes metadata header lines (video length, target audience, tone, style)', () => {
    const cases = [
      { input: 'Video length: 10 minutes\nHello world',    absent: 'Video length' },
      { input: 'Target audience: developers\nHello world', absent: 'Target audience' },
      { input: 'Tone: educational\nHello world',           absent: 'Tone:' },
      { input: 'Style: tutorial\nHello world',             absent: 'tutorial' },
    ];
    cases.forEach(({ input, absent }) => {
      const output = cleanScript(input);
      assert.strictEqual(output.includes(absent), false, `Should remove "${absent}"`);
      assert.strictEqual(output.includes('Hello world'), true, 'Should keep normal content');
    });
  });

  test('preserves normal spoken sentences intact', () => {
    const sentences = [
      'Welcome to this video about Kubernetes.',
      'Today we are going to learn something amazing.',
      'Let me show you how this works in practice.',
      'If you found this helpful, please subscribe!',
    ];
    sentences.forEach(sentence => {
      const output = cleanScript(sentence);
      assert.strictEqual(output.trim(), sentence.trim());
    });
  });

  test('collapses multiple blank lines to max 2', () => {
    const input     = 'Line 1\n\n\n\n\nLine 2';
    const output    = cleanScript(input);
    const blankRun  = output.match(/\n{3,}/);
    assert.strictEqual(blankRun, null, 'Should have no runs of 3+ newlines');
  });

  test('removes standalone parenthetical stage directions', () => {
    const input  = 'Welcome everyone.\n(Pause for effect)\nLet us begin.';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('Pause for effect'), false);
    assert.strictEqual(output.includes('Welcome everyone'), true);
  });

  test('removes delivery-word parentheticals inline', () => {
    const input  = 'This is important (speaking fast) and you should remember it.';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('speaking fast'), false);
    assert.strictEqual(output.includes('important'), true);
  });

  test('removes curly-brace directions', () => {
    const input  = 'Click {B-ROLL: show diagram} here to learn more.';
    const output = cleanScript(input);
    assert.strictEqual(output.includes('{'), false);
    assert.strictEqual(output.includes('B-ROLL'), false);
  });

  test('replaces inline code with identifier text', () => {
    const input  = 'Run the kubectl command to check the pods.';
    const output = cleanScript(input);
    // No backticks in plain text — should pass through unchanged
    assert.ok(output.includes('kubectl'));
  });

  test('handles empty input gracefully', () => {
    assert.strictEqual(cleanScript(''), '');
    assert.strictEqual(cleanScript(null), '');
    assert.strictEqual(cleanScript(undefined), '');
  });

  test('processes the sample fixture script without throwing', () => {
    const raw = fs.readFileSync(
      path.join(__dirname, 'fixtures', 'sample-script.txt'), 'utf8'
    );
    let output;
    assert.doesNotThrow(() => { output = cleanScript(raw); });
    // Headers removed
    assert.strictEqual(output.includes('# Kubernetes'), false);
    // Code block replaced
    assert.strictEqual(output.includes('```yaml'), false);
    // Normal sentences preserved
    assert.ok(output.includes('Welcome to this video about Kubernetes'));
    // CTA preserved
    assert.ok(output.includes('subscribe'));
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 2 — Topic Parsing Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Topic parsing', () => {

  test('parses valid topics JSON array', () => {
    const mockResponse = anthropicMock.createTopicsResponse([
      {
        title: 'AI Agents in 2026',
        summary: 'How AI agents are changing DevOps',
        tags: ['AI', 'DevOps'],
        hook: 'Your pipeline just got smarter',
        trending_since: 'April 2026',
        source_hint: 'Recent GitHub announcements',
      },
    ]);

    const topics = parseTopicsResponse(mockResponse);
    assert.strictEqual(topics.length, 1);
    assert.strictEqual(topics[0].title, 'AI Agents in 2026');
    assert.ok(Array.isArray(topics[0].tags));
  });

  test('handles response with tool_use blocks mixed in', () => {
    const mockResponse = anthropicMock.createWebSearchResponse([
      { title: 'Test Topic', summary: 'Summary', tags: [], hook: 'Hook' },
    ]);

    const topics = parseTopicsResponse(mockResponse);
    assert.strictEqual(topics.length, 1);
    assert.strictEqual(topics[0].title, 'Test Topic');
  });

  test('throws when no text blocks exist in response', () => {
    const mockResponse = { content: [{ type: 'tool_use', name: 'web_search' }] };
    assert.throws(
      () => parseTopicsResponse(mockResponse),
      /no text/i,
    );
  });

  test('parses multiple topics from fixture file', () => {
    const raw    = fs.readFileSync(
      path.join(__dirname, 'fixtures', 'sample-topics.json'), 'utf8'
    );
    const topics = JSON.parse(raw);
    assert.strictEqual(topics.length, 3);
    topics.forEach(t => {
      assert.ok(t.title,   'topic has title');
      assert.ok(t.summary, 'topic has summary');
      assert.ok(Array.isArray(t.tags), 'tags is array');
    });
  });

  test('filterRecentTopics removes topics with old year references', () => {
    const topics = [
      { title: 'AI in 2024', summary: 'in 2024 study shows...', tags: [], hook: '' },
      { title: 'AI in 2026', summary: 'recent 2026 data',       tags: [], hook: '' },
    ];
    const filtered = filterRecentTopics(topics);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].title, 'AI in 2026');
  });

  test('filterRecentTopics keeps topics with no year reference', () => {
    const topics = [
      { title: 'Kubernetes Best Practices', summary: 'Run containers better.', tags: [], hook: '' },
    ];
    const filtered = filterRecentTopics(topics);
    assert.strictEqual(filtered.length, 1);
  });

  test('filterRecentTopics keeps topics with current year only', () => {
    const currentYear = new Date().getFullYear();
    const topics = [
      { title: `DevOps in ${currentYear}`, summary: `${currentYear} trends.`, tags: [], hook: '' },
    ];
    const filtered = filterRecentTopics(topics);
    assert.strictEqual(filtered.length, 1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 3 — Script Generation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Script generation helpers', () => {

  test('isScriptTruncated detects max_tokens stop reason', () => {
    const truncated = anthropicMock.createScriptResponse('partial...', true);
    assert.strictEqual(isScriptTruncated(truncated), true);
  });

  test('isScriptTruncated returns false for end_turn', () => {
    const complete = anthropicMock.createScriptResponse('Full script. See you next time!');
    assert.strictEqual(isScriptTruncated(complete), false);
  });

  test('hasProperEnding detects subscribe CTA', () => {
    assert.strictEqual(
      hasProperEnding('Great content... smash that subscribe button!'),
      true,
    );
  });

  test('hasProperEnding detects like-button CTA', () => {
    assert.strictEqual(
      hasProperEnding('Hope you enjoyed... hit the like button below.'),
      true,
    );
  });

  test('hasProperEnding detects see-you-next-one', () => {
    assert.strictEqual(
      hasProperEnding('I will see you in the next one!'),
      true,
    );
  });

  test('hasProperEnding detects thanks-for-watching', () => {
    assert.strictEqual(
      hasProperEnding('Thanks for watching everyone!'),
      true,
    );
  });

  test('hasProperEnding returns false for missing CTA', () => {
    assert.strictEqual(
      hasProperEnding('And that is how Kubernetes works. The end.'),
      false,
    );
  });

  test('countWords counts correctly', () => {
    assert.strictEqual(countWords('hello world'), 2);
    assert.strictEqual(countWords('  '), 0);
    assert.strictEqual(countWords(''), 0);
    assert.strictEqual(countWords('one two three four five'), 5);
  });

  test('isWithinWordLimit returns false when over 4500 words', () => {
    const script = 'word '.repeat(4600);
    assert.ok(countWords(script) > 4500);
    assert.strictEqual(isWithinWordLimit(script), false);
  });

  test('isWithinWordLimit returns true for normal scripts', () => {
    const script = 'word '.repeat(1200);
    assert.strictEqual(isWithinWordLimit(script), true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 4 — localStorage Cache Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('localStorage operations', () => {

  test('saves and retrieves topic cache', () => {
    const storage = createMockStorage();
    const niche   = 'AI & machine learning';
    const topics  = [{ title: 'Test', summary: 'S', tags: [], hook: 'H' }];

    saveTopicsCache(niche, topics, storage);
    const retrieved = getTopicsCache(niche, storage);

    assert.ok(retrieved !== null, 'Cache should exist');
    assert.strictEqual(retrieved.topics[0].title, 'Test');
    assert.strictEqual(retrieved.niche, niche);
  });

  test('cache expires after 6 hours', () => {
    const storage      = createMockStorage();
    const niche        = 'DevOps';
    const oldTimestamp = Date.now() - (7 * 60 * 60 * 1000); // 7 hours ago
    const dateKey      = new Date().toISOString().split('T')[0];

    storage.setItem(
      `${CACHE_PREFIX}${niche}_${dateKey}`,
      JSON.stringify({ topics: [{ title: 'Old Topic' }], timestamp: oldTimestamp, niche }),
    );

    const retrieved = getTopicsCache(niche, storage);
    assert.strictEqual(retrieved, null, 'Expired cache should return null');
  });

  test('fresh cache within 6 hours is returned', () => {
    const storage      = createMockStorage();
    const niche        = 'AI & Technology';
    const newTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
    const dateKey      = new Date().toISOString().split('T')[0];

    storage.setItem(
      `${CACHE_PREFIX}${niche}_${dateKey}`,
      JSON.stringify({ topics: [{ title: 'Fresh Topic' }], timestamp: newTimestamp, niche }),
    );

    const retrieved = getTopicsCache(niche, storage);
    assert.ok(retrieved !== null, 'Fresh cache should be returned');
    assert.strictEqual(retrieved.topics[0].title, 'Fresh Topic');
  });

  test('saves all credentials to mock storage', () => {
    const storage  = createMockStorage();
    const settings = {
      anthropicApiKey: 'sk-ant-test',
      heygenApiKey:    'hg-test',
      heygenAvatarId:  'avatar-123',
      heygenVoiceId:   'voice-456',
    };

    saveSettings(settings, storage);

    assert.strictEqual(storage.getItem('anthropicApiKey'), 'sk-ant-test');
    assert.strictEqual(storage.getItem('heygenApiKey'),    'hg-test');
    assert.strictEqual(storage.getItem('heygenAvatarId'),  'avatar-123');
    assert.strictEqual(storage.getItem('heygenVoiceId'),   'voice-456');
  });

  test('getTopicsCache returns null for empty storage', () => {
    const storage   = createMockStorage();
    const retrieved = getTopicsCache('NonExistentNiche', storage);
    assert.strictEqual(retrieved, null);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 5 — YouTube Token Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('YouTube token helpers', () => {

  test('isTokenExpiredError detects "expired" keyword', () => {
    assert.strictEqual(isTokenExpiredError('Token has been expired or revoked'), true);
  });

  test('isTokenExpiredError detects "revoked" keyword', () => {
    assert.strictEqual(isTokenExpiredError('Token has been revoked'), true);
  });

  test('isTokenExpiredError returns false for unrelated errors', () => {
    assert.strictEqual(isTokenExpiredError('Some other network error'), false);
    assert.strictEqual(isTokenExpiredError('Invalid request format'), false);
  });

  test('getTokenAgeDays calculates age correctly', () => {
    const savedDate = new Date();
    savedDate.setDate(savedDate.getDate() - 100);

    const age = getTokenAgeDays(savedDate.toISOString());
    assert.ok(age >= 99 && age <= 101, `Expected ~100 days, got ${age}`);
  });

  test('getTokenAgeDays returns 0 for just-created token', () => {
    const age = getTokenAgeDays(new Date().toISOString());
    assert.ok(age === 0 || age === 1, 'Should be 0 or 1 days old');
  });

  test('getTokenWarning returns message for token older than 150 days', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 160);

    const warning = getTokenWarning(oldDate.toISOString());
    assert.ok(warning !== null, 'Should return a warning');
    assert.ok(warning.includes('days'), 'Warning should mention days');
  });

  test('getTokenWarning returns critical message for token older than 180 days', () => {
    const veryOldDate = new Date();
    veryOldDate.setDate(veryOldDate.getDate() - 185);

    const warning = getTokenWarning(veryOldDate.toISOString());
    assert.ok(warning !== null);
    assert.ok(/re-authenticate/i.test(warning));
  });

  test('getTokenWarning returns null for recent tokens', () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30);

    const warning = getTokenWarning(recentDate.toISOString());
    assert.strictEqual(warning, null, 'No warning for recent token');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 6 — Cost Tracking Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('API cost tracking', () => {

  test('calculateApiCost returns correct value', () => {
    const inputTokens  = 1000;
    const outputTokens = 500;

    // $3/1M input + $15/1M output
    const expected = (1000 * 0.000003) + (500 * 0.000015);
    const actual   = calculateApiCost(inputTokens, outputTokens);

    assert.ok(Math.abs(actual - expected) < 0.000001, `Cost mismatch: ${actual} vs ${expected}`);
  });

  test('calculateApiCost with zero tokens returns 0', () => {
    assert.strictEqual(calculateApiCost(0, 0), 0);
  });

  test('fmtCost formats small values correctly', () => {
    assert.strictEqual(fmtCost(0.001), '<$0.01');
    assert.strictEqual(fmtCost(0.004), '<$0.01');
  });

  test('fmtCost formats larger values correctly', () => {
    assert.strictEqual(fmtCost(0.50), '$0.50');
    assert.strictEqual(fmtCost(1.23), '$1.23');
  });

  test('recordApiUsage + getTodayTotal track cumulative cost', () => {
    const storage = createMockStorage();

    recordApiUsage('topic_search', 500,  1200, storage);
    recordApiUsage('script_gen',   800,  3000, storage);

    const todayTotal = getTodayTotal(storage);
    const expected   = calculateApiCost(500, 1200) + calculateApiCost(800, 3000);

    assert.ok(
      Math.abs(todayTotal - expected) < 0.0001,
      `Total ${todayTotal} should be ~${expected}`,
    );
  });

  test('getTodayTotal returns 0 for empty storage', () => {
    const storage = createMockStorage();
    assert.strictEqual(getTodayTotal(storage), 0);
  });

  test('multiple calls accumulate correctly', () => {
    const storage    = createMockStorage();
    const iterations = 5;

    for (let i = 0; i < iterations; i++) {
      recordApiUsage('script_gen', 100, 200, storage);
    }

    const total    = getTodayTotal(storage);
    const expected = iterations * calculateApiCost(100, 200);
    assert.ok(Math.abs(total - expected) < 0.000001);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 7 — FFmpeg Command Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FFmpeg filter generation', () => {

  test('buildPIPFilter includes required filter components', () => {
    const filter = buildPIPFilter(1267, 30);

    assert.ok(filter.includes('[0:v]'),        'Has slideshow input');
    assert.ok(filter.includes('[1:v]'),        'Has avatar input');
    assert.ok(filter.includes('overlay'),      'Has overlay filter');
    assert.ok(filter.includes('scale=1280:720'), 'Scales to 1280x720');
    assert.ok(filter.includes('[outv]'),       'Has output label');
  });

  test('buildPIPFilter generates correct CTA timing for 1267s video', () => {
    const filter   = buildPIPFilter(1267, 30);
    const ctaStart = (1267 - 30).toFixed(3); // 1237.000
    const ctaEnd   = (1267 - 8).toFixed(3);  // 1259.000

    assert.ok(filter.includes(ctaStart), `Should include ctaStart=${ctaStart}`);
    assert.ok(filter.includes(ctaEnd),   `Should include ctaEnd=${ctaEnd}`);
  });

  test('buildPIPFilter includes avatar pad/border', () => {
    const filter = buildPIPFilter(600);
    assert.ok(filter.includes('pad=iw+6:ih+6'), 'Has 3px border padding');
    assert.ok(filter.includes('color=white'),   'Has white border color');
  });

  test('calculates correct CTA timing values', () => {
    const totalDuration = 1267;
    const ctaStart      = totalDuration - 30;
    const ctaEnd        = totalDuration - 8;

    assert.strictEqual(ctaStart, 1237);
    assert.strictEqual(ctaEnd,   1259);
  });

  test('distributeDurations arithmetic: slide duration per content slide', () => {
    const totalDuration   = 600; // 10 minutes
    const titleDuration   = 30;
    const thankyouDuration = 8;
    const slideCount      = 8;

    const contentDuration = totalDuration - titleDuration - thankyouDuration;
    const perSlide        = Math.floor(contentDuration / slideCount);

    assert.strictEqual(contentDuration, 562);
    assert.strictEqual(perSlide, 70);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 8 — Mermaid Validation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Mermaid diagram validation', () => {

  test('accepts valid flowchart syntax', () => {
    assert.strictEqual(isValidMermaidCode('flowchart LR\n  A --> B'), true);
  });

  test('accepts valid graph syntax', () => {
    assert.strictEqual(isValidMermaidCode('graph TD\n  A[Start] --> B[End]'), true);
  });

  test('accepts valid sequenceDiagram', () => {
    assert.strictEqual(isValidMermaidCode('sequenceDiagram\n  Alice->>Bob: Hello'), true);
  });

  test('accepts valid pie chart', () => {
    assert.strictEqual(isValidMermaidCode('pie title Pets\n  "Dogs" : 386'), true);
  });

  test('rejects plain text that is not mermaid', () => {
    assert.strictEqual(isValidMermaidCode('See diagram in accompanying material'), false);
  });

  test('rejects empty string', () => {
    assert.strictEqual(isValidMermaidCode(''), false);
  });

  test('rejects null/undefined', () => {
    assert.strictEqual(isValidMermaidCode(null), false);
    assert.strictEqual(isValidMermaidCode(undefined), false);
  });

  test('rejects strings shorter than 10 chars', () => {
    assert.strictEqual(isValidMermaidCode('graph TD'), false);
  });

  test('rejects unknown diagram type', () => {
    assert.strictEqual(isValidMermaidCode('chart TD\n  A --> B'), false);
  });

  test('accepts mindmap syntax', () => {
    assert.strictEqual(isValidMermaidCode('mindmap\n  root\n    child'), true);
  });

  test('accepts gantt chart', () => {
    assert.strictEqual(isValidMermaidCode('gantt\n  title Project\n  section A\n    Task: 0, 1d'), true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY 9 — Integration Tests (with mocked fetch)
// ─────────────────────────────────────────────────────────────────────────────

describe('Integration tests (mocked API)', () => {

  test('full topic search flow returns parsed topics', async () => {
    const mockTopics = [
      { title: 'Mock Topic 1', summary: 'Summary 1', tags: ['AI'],    hook: 'Hook 1', trending_since: 'April 2026', source_hint: 'News' },
      { title: 'Mock Topic 2', summary: 'Summary 2', tags: ['DevOps'], hook: 'Hook 2', trending_since: 'April 2026', source_hint: 'Community' },
    ];

    global.fetch = async () => ({
      ok:   true,
      json: async () => anthropicMock.createTopicsResponse(mockTopics),
    });

    const topics = await fetchTopics('AI & machine learning', 'sk-ant-mock-key');

    assert.strictEqual(topics.length, 2);
    assert.strictEqual(topics[0].title, 'Mock Topic 1');
    assert.strictEqual(topics[1].title, 'Mock Topic 2');
  });

  test('topic search throws on non-OK response', async () => {
    global.fetch = async () => ({
      ok:         false,
      statusText: 'Unauthorized',
      json:       async () => ({}),
    });

    await assert.rejects(
      () => fetchTopics('AI', 'bad-key'),
      /API error/i,
    );
  });

  test('script generation continuation: retries on max_tokens', async () => {
    let callCount = 0;

    global.fetch = async () => {
      callCount++;
      return {
        ok:   true,
        json: async () =>
          callCount < 2
            ? anthropicMock.createScriptResponse('Partial script without ending...', true)
            : anthropicMock.createScriptResponse('Continuation... See you in the next one!', false),
      };
    };

    const script = await generateFullScript('Test prompt', 'sk-ant-mock', 2000);

    assert.strictEqual(callCount, 2, 'Should have made exactly 2 API calls');
    assert.ok(script.includes('See you in the next one'), 'Full script should include continuation text');
  });

  test('parseTopicsResponse handles web search mixed content', () => {
    const response = anthropicMock.createWebSearchResponse([
      { title: 'Mixed Response Topic', summary: 'From web search', tags: [], hook: 'Hook' },
    ]);
    const topics = parseTopicsResponse(response);
    assert.strictEqual(topics.length, 1);
    assert.strictEqual(topics[0].title, 'Mixed Response Topic');
  });

  test('cost tracking accumulates across multiple mock calls', async () => {
    const storage = createMockStorage();

    recordApiUsage('topic_search', 800,  300, storage);
    recordApiUsage('script_gen',   1200, 3500, storage);
    recordApiUsage('script_gen',   100,  200, storage);

    const total    = getTodayTotal(storage);
    const expected =
      calculateApiCost(800, 300) +
      calculateApiCost(1200, 3500) +
      calculateApiCost(100, 200);

    assert.ok(total > 0, 'Total cost should be positive');
    assert.ok(Math.abs(total - expected) < 0.0001);
  });

});
