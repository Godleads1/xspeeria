/**
 * Finds every sentence the app shows (ADR-053): the first argument of `tr(...)`, `k(...)` and
 * `trRich(...)` when it is written out as text. Used by the language test and by the
 * translation tooling; never shipped logic.
 */

const CALL = /\b(?:tr|k|trRich)\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/g;

export function keysIn(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(CALL)) {
    const raw = m[1] ?? m[2] ?? '';
    // Unescape like JavaScript would for these simple literals.
    out.push(raw.replace(/\\(["'\\])/g, '$1').replace(/\\n/g, '\n'));
  }
  return out;
}

/** `{{name}}` placeholders, sorted. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

/** `<1>` … `</1>` style tags, sorted. */
export function tags(text: string): string[] {
  return [...text.matchAll(/<(\d+)>/g)].map((m) => m[1]).sort();
}
