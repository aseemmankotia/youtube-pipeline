/**
 * cleanScript — strips markdown / code / technical noise from a YouTube script
 * so it reads as pure spoken text (no symbols HeyGen would speak aloud).
 *
 * Used in:
 *   components/heygen.js  — before sending to HeyGen API
 *   components/script.js  — "Preview (cleaned)" toggle
 *
 * NOT used by render.js slide-splitter — that has its own minimal copy so
 * the Anthropic API still sees raw code for code-type slides.
 */

// Phrases cycled through when replacing code blocks so it doesn't sound repetitive
const CODE_PHRASES = [
  '[Here you can see the code example on screen]',
  '[As shown in the code on screen]',
  '[Take a look at this implementation on screen]',
  "[Here's what the code looks like]",
  '[Check out this code example]',
];
let _phraseIdx = 0;
function nextCodePhrase() {
  return CODE_PHRASES[_phraseIdx++ % CODE_PHRASES.length];
}

export function cleanScript(raw) {
  if (!raw) return '';

  // Reset phrase rotation on each call so output is deterministic per call
  _phraseIdx = 0;

  // ── Pass 1: multi-line substitutions (operate on full string) ─────────────

  let text = raw;

  // Fenced code blocks: ```lang ... ``` (possibly spanning many lines)
  text = text.replace(/```[\s\S]*?```/gm, () => nextCodePhrase());

  // JSON / YAML blocks: lines where ≥3 consecutive lines look like key:value
  // or pure bracket/brace structure — replace group with config phrase
  text = text.replace(
    /((?:^[ \t]*(?:[{}\[\]]|"[\w-]+"\s*:|[\w-]+:\s+\S).*\n){3,})/gm,
    '[configuration shown on screen]\n'
  );

  // ── Pass 2: line-by-line processing ───────────────────────────────────────

  const lines = text.split('\n').map(line => {
    // Preserve the original for indented-code detection before trimming
    const raw = line;
    let l = line.trim();

    // ── Drop entire line ────────────────────────────────────────────────────

    // Markdown headings
    if (/^#{1,6}(\s|$)/.test(l)) return '';

    // Lines containing "YouTube Script" (title blocks)
    if (/youtube\s+script/i.test(l)) return '';

    // Lines that are ONLY a style/metadata label word
    if (/^(entertainment|tutorial|how-to|opinion|commentary|news|explainer|storytime|narrative|tech|short|medium|long|minutes?)\s*$/i.test(l)) return '';

    // Horizontal rules
    if (/^[-=]{3,}$/.test(l)) return '';

    // Square-bracket stage direction labels on their own line: [HOOK], [CLOSING], etc.
    if (/^\[[\w\s/&:,.'"\d-]+\][:,]?\s*$/.test(l)) return '';

    // HTML tags — if line is entirely HTML markup, drop it
    if (/^<[^>]+>$/.test(l)) return '';

    // Indented code blocks (4 spaces indent = markdown code)
    if (/^    \S/.test(raw)) return nextCodePhrase();

    // Lines that look like pure CLI invocations with multiple flags:
    // e.g.  ffmpeg -i input.mp4 -vf scale=1280:720 -c:v libx264 output.mp4
    if ((l.match(/(?:^|\s)-{1,2}[a-zA-Z]/g) || []).length >= 2) {
      return '[terminal command shown on screen]';
    }

    // ── Inline substitutions ────────────────────────────────────────────────

    // Parenthetical stage directions: (pause) (smiles at camera) (Tone: X)
    l = l.replace(/\([^)]*\)/g, '');

    // URLs → spoken placeholder
    l = l.replace(/https?:\/\/[^\s)>"']+/g, '[link shown on screen]');

    // File paths: /path/to/file or ~/path/to/file
    l = l.replace(/(?:~\/|\/)[/\w.\-]+(?:\/[\w.\-]+)+/g, '[file path shown on screen]');

    // node@18.0.0 style version pinning → "node version 18"
    l = l.replace(/\b([\w-]+)@(\d+)\.[\d.]+/g, '$1 version $2');

    // Semver prefixes: ^1.2.3  ~2.0.0  → remove
    l = l.replace(/[\^~](\d+\.\d+[\d.]*)/g, '');

    // Inline code: `...`
    l = l.replace(/`([^`\n]+)`/g, (_, code) => {
      const c = code.trim();
      // Shell / package-manager commands → "X command"
      if (/^(npm|yarn|pnpm|npx|node|python|pip|brew|apt|cargo|go\s|docker|kubectl|git|curl|wget|ssh|scp|chmod|chown|mkdir|cd|ls|cat|grep|sed|awk)\b/.test(c)) {
        const cmd = c.split(/\s+/)[0];
        return `${cmd} command`;
      }
      // Otherwise just remove the backticks and keep the identifier
      return c;
    });

    // HTML tags inline: <div>, </span>, className="..." → remove
    l = l.replace(/<[^>]+>/g, '');

    // **bold** → keep content
    l = l.replace(/\*\*([^*\n]+)\*\*/g, '$1');

    // *stage direction* → remove entirely
    l = l.replace(/\*[^*\n]+\*/g, '');

    // __bold__ / _italic_ → keep content
    l = l.replace(/__([^_\n]+)__/g, '$1');
    l = l.replace(/_([^_\n]+)_/g, '$1');

    // Blockquote symbol → keep content
    l = l.replace(/^>\s*/, '');

    // Leading bullet or dash → keep content
    l = l.replace(/^[-•]\s+/, '');

    return l.trim();
  });

  return lines
    .filter(l => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
