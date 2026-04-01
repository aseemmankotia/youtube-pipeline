/**
 * cleanScript — strips markdown formatting and metadata from a YouTube script
 * so it reads as pure spoken text (no symbols HeyGen would speak aloud).
 *
 * Used in:
 *   components/heygen.js  — before sending to HeyGen API
 *   components/script.js  — "Preview (cleaned)" toggle
 *   render.js             — before passing script to Anthropic slide-split
 */

export function cleanScript(raw) {
  if (!raw) return '';

  const lines = raw.split('\n').map(line => {
    let l = line.trim();

    // ── Drop entire line for metadata patterns ─────────────────────────────

    // Markdown headings: #, ##, ###, etc.
    if (/^#{1,6}(\s|$)/.test(l)) return '';

    // Lines containing "YouTube Script" (e.g. title blocks)
    if (/youtube\s+script/i.test(l)) return '';

    // Lines that are ONLY a style/metadata label word
    if (/^(entertainment|tutorial|how-to|opinion|commentary|news|explainer|storytime|narrative|tech|short|medium|long|minutes?)\s*$/i.test(l)) return '';

    // Horizontal rules: --- or ===
    if (/^[-=]{3,}$/.test(l)) return '';

    // Square-bracket stage direction labels: [HOOK], [INTRO], [B-ROLL], etc.
    // Matches a whole line that is exactly one bracket label (possibly with trailing colon or number)
    if (/^\[[\w\s/&:,.'"\d-]+\][:,]?\s*$/.test(l)) return '';

    // ── Strip inline formatting (order matters) ────────────────────────────

    // Parenthetical stage directions: (pause) (smiles at camera) (Tone: X)
    l = l.replace(/\([^)]*\)/g, '');

    // **bold** → keep content
    l = l.replace(/\*\*([^*\n]+)\*\*/g, '$1');

    // *single-asterisk content* → remove entirely
    // These are almost always stage directions (*pause*, *lean in*, *cut to B-roll*)
    l = l.replace(/\*[^*\n]+\*/g, '');

    // __bold__ → keep content
    l = l.replace(/__([^_\n]+)__/g, '$1');

    // _italic_ → keep content
    l = l.replace(/_([^_\n]+)_/g, '$1');

    // Code fences and inline code
    l = l.replace(/```[\s\S]*?```/g, '');
    l = l.replace(/`[^`\n]*`/g, '');

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
