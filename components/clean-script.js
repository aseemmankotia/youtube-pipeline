/**
 * cleanScript — strips ALL markdown / stage-direction / code / technical noise
 * from a YouTube script so it reads as pure spoken text for HeyGen.
 *
 * Used in:
 *   components/heygen.js  — before sending to HeyGen API
 *   components/script.js  — "Preview cleaned" toggle
 *
 * NOT used by render.js slide-splitter — that has its own minimal copy so
 * the Anthropic API still sees raw code for code-type slides.
 */

// Code-block replacement phrases — no brackets so they survive bracket-stripping
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

// Delivery/tone words that flag a parenthetical as a stage direction
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

export function cleanScript(raw) {
  if (!raw) return '';
  _phraseIdx = 0;

  let text = raw;

  // ── Phase 1: Replace code blocks with spoken text (before bracket-stripping) ─

  // Fenced code blocks: ```lang ... ```
  text = text.replace(/```[\s\S]*?```/gm, () => nextCodePhrase());

  // Indented code blocks (4-space indent) — line-level, handled in phase 3

  // ── Phase 2: String-level removal ────────────────────────────────────────────

  // Remove ALL square-bracket content: [HOOK], [SECTION 1], [B-ROLL], etc.
  text = text.replace(/\[[^\]]*\]/g, '');

  // Remove curly-brace directions: {like this}
  text = text.replace(/\{[^}]*\}/g, '');

  // Remove *(...) stage directions: *(pause)*, *(cut to B-roll)*
  text = text.replace(/\*\([^)]*\)\*/g, '');

  // Remove markdown headings (must come before bold stripping)
  text = text.replace(/^#{1,6}[^\n]*/gm, '');

  // Remove divider lines: ---, ===, ***
  text = text.replace(/^[-=*]{3,}\s*$/gm, '');

  // Remove metadata header lines
  text = text.replace(/^.*youtube\s+script.*$/gim, '');
  text = text.replace(/^.*video\s+length[:\s].*$/gim, '');
  text = text.replace(/^.*target\s+audience[:\s].*$/gim, '');
  text = text.replace(/^.*\btone\s*:.*$/gim, '');
  text = text.replace(/^.*\bstyle\s*:.*$/gim, '');

  // ── Phase 3: Line-by-line processing ─────────────────────────────────────────

  const processedLines = text.split('\n').map(line => {
    const original = line;
    let l = line.trim();

    // Drop lines that are now empty or whitespace-only after phase 2 removals
    if (!l) return '';

    // Drop style/metadata label-only lines
    if (/^(entertainment|tutorial|how-to|opinion|commentary|news|explainer|storytime|narrative|tech|short|medium|long|minutes?)\s*$/i.test(l)) return '';

    // Drop lines that are entirely HTML tags
    if (/^<[^>]+>$/.test(l)) return '';

    // Indented code blocks (4 spaces) → spoken phrase
    if (/^    \S/.test(original)) return nextCodePhrase();

    // CLI commands with 2+ flags → spoken placeholder
    if ((l.match(/(?:^|\s)-{1,2}[a-zA-Z]/g) || []).length >= 2) {
      return 'You can see the terminal command on screen.';
    }

    // ── Inline substitutions ──────────────────────────────────────────────────

    // Standalone parenthetical stage directions on own line: (Pause for effect)
    if (/^\([^)]*\)\s*$/.test(l)) return '';

    // Delivery-word parentheticals: (speaking fast), (pause), (smile)
    l = l.replace(DELIVERY_RE, '');

    // Remaining parentheticals that look like stage directions (all caps, short)
    l = l.replace(/\(([A-Z][^a-z)]{0,30})\)/g, '');

    // URLs → spoken placeholder
    l = l.replace(/https?:\/\/[^\s)>"']+/g, 'the link shown on screen');

    // File paths: /path/to/file or ~/path
    l = l.replace(/(?:~\/|\/)[/\w.\-]+(?:\/[\w.\-]+)+/g, 'the file path shown on screen');

    // package@version → "package version N"
    l = l.replace(/\b([\w-]+)@(\d+)\.[\d.]+/g, '$1 version $2');

    // Semver range prefixes: ^1.2.3  ~2.0.0
    l = l.replace(/[\^~](\d+\.\d+[\d.]*)/g, '');

    // Inline code: `code` → natural language or bare identifier
    l = l.replace(/`([^`\n]+)`/g, (_, code) => {
      const c = code.trim();
      if (/^(npm|yarn|pnpm|npx|node|python|pip|brew|apt|cargo|docker|kubectl|git|curl|wget|ssh|scp|chmod|chown|mkdir|cd|ls|cat|grep|sed|awk)\b/.test(c)) {
        return c.split(/\s+/)[0] + ' command';
      }
      return c;
    });

    // HTML tags
    l = l.replace(/<[^>]+>/g, '');

    // **bold** → keep content
    l = l.replace(/\*\*([^*\n]+)\*\*/g, '$1');

    // *italic/stage direction* → remove (single asterisk = usually a direction)
    l = l.replace(/\*[^*\n]+\*/g, '');

    // __bold__ / _italic_ → keep content
    l = l.replace(/__([^_\n]+)__/g, '$1');
    l = l.replace(/_([^_\n]+)_/g, '$1');

    // Blockquote marker
    l = l.replace(/^>\s*/, '');

    // Leading bullet/dash
    l = l.replace(/^[-•]\s+/, '');

    // Collapse multiple spaces
    l = l.replace(/  +/g, ' ').trim();

    return l;
  });

  // ── Phase 4: Final cleanup ────────────────────────────────────────────────────

  return processedLines
    .filter(l => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
