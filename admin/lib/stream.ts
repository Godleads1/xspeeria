/**
 * Throttled, non-blocking text streaming (ADR-064) — the "typing" effect for short texts such as
 * the dashboard's "Today at a glance".
 *
 * Design goals
 * ------------
 * 1. NON-BLOCKING: every step runs inside `requestAnimationFrame`, so the browser paints, runs
 *    charts and handles clicks between steps. Nothing loops synchronously; work per frame is a
 *    few words appended to ONE text node (no re-render of surrounding components).
 * 2. ADAPTIVE CHUNKING: the text is split into word tokens (word + following space). Each step
 *    writes 1..`maxPerFrame` tokens — never one character at a time.
 * 3. TOKEN JUMPING (cadence): how many tokens a step takes is weighted — short words are taken
 *    in bigger bites, a step after punctuation takes one word (a short "breath") — so the rhythm
 *    looks natural instead of a metronome. `random` is injectable for tests.
 * 4. TIME-TO-FIRST-TOKEN: a configurable delay before the first word, measured with
 *    `performance.now()`; `onMetrics` gets { ttftMs } when the first word lands and the totals
 *    at the end.
 * 5. CLEANUP & BAIL-OUTS: stops when the text is done, when `maxTokens` or `maxMs` is reached
 *    (the rest is written at once, so nothing is cut off), or when `signal` aborts. Every pending
 *    frame and timer is cancelled; the returned `stop()` does the same.
 *
 * Tuning (see PRESETS)
 * --------------------
 * - Faster: raise `maxPerFrame` (bigger bites) or lower `minGapMs` (more steps per second).
 * - Slower / more "deliberate": `maxPerFrame` 1–2 and `minGapMs` 60–90.
 * - Shorter wait before it starts: lower `ttftMs`.
 * - Small tiles: `tile` preset. Wide panels: `panel`. Long reports: `report`.
 * At 60 fps a frame is ~16 ms; `minGapMs` 28 means a step every second frame.
 *
 * Accessibility: with "reduce motion" switched on in the computer's settings, the whole text is
 * written at once (no timers at all). Callers should mark the container `aria-busy` while
 * streaming so screen readers read the finished sentence once.
 */

export interface StreamOptions {
  /** Wait before the first word (simulated time-to-first-token), ms. */
  ttftMs: number;
  /** Most word tokens written in one step. */
  maxPerFrame: number;
  /** Least time between steps, ms (frames in between are skipped, not busy-waited). */
  minGapMs: number;
  /** Safety: stop animating after this many tokens and write the rest at once. */
  maxTokens: number;
  /** Safety: stop animating after this long and write the rest at once, ms. */
  maxMs: number;
}

export const PRESETS = {
  tile: { ttftMs: 250, maxPerFrame: 3, minGapMs: 22, maxTokens: 120, maxMs: 4000 },
  panel: { ttftMs: 450, maxPerFrame: 3, minGapMs: 30, maxTokens: 400, maxMs: 8000 },
  report: { ttftMs: 600, maxPerFrame: 2, minGapMs: 45, maxTokens: 2000, maxMs: 20000 },
} satisfies Record<string, StreamOptions>;

export interface StreamMetrics {
  /** From start to the first word on screen. */
  ttftMs?: number;
  /** From start to the end. */
  totalMs?: number;
  tokens?: number;
  steps?: number;
  /** Why it stopped. */
  reason?: 'finished' | 'token-limit' | 'time-limit' | 'aborted' | 'reduced-motion';
}

export interface StreamDeps {
  /** Frame scheduler (window.requestAnimationFrame in the browser). */
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  setTimeout: (cb: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
  random: () => number;
  reducedMotion: boolean;
}

function browserDeps(): StreamDeps {
  let reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    reduce = false;
  }
  return {
    raf: (cb) => window.requestAnimationFrame(cb),
    caf: (id) => window.cancelAnimationFrame(id),
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    now: () => performance.now(),
    random: Math.random,
    reducedMotion: reduce,
  };
}

/** Word tokens: each word with the spaces after it, so joining them gives the text back. */
export function tokenize(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? [];
}

/**
 * How many tokens the next step takes (1..max): weighted by the next word's length and whether
 * the previous token ended a clause. Pure, so tests can check the cadence.
 */
export function stepSize(prev: string, next: string, max: number, random: number): number {
  if (/[.,;:!?]\s*$/.test(prev)) return 1; // a short breath after punctuation
  const word = next.trim();
  // Short words ("a", "of", "to") ride along with the next one: bigger bites.
  const weight = word.length <= 3 ? 1.6 : word.length >= 9 ? 0.7 : 1;
  return Math.max(1, Math.min(max, Math.round(1 + random * (max - 1) * weight)));
}

/**
 * Streams `text` into `write` (called with the full text so far — write it to one text node).
 * Returns `stop()`. Never throws on abort; `onDone` and `onMetrics` run exactly once at the end.
 */
export function streamText(
  text: string,
  write: (soFar: string) => void,
  opts: Partial<StreamOptions> & {
    signal?: AbortSignal;
    onMetrics?: (m: StreamMetrics) => void;
    onDone?: () => void;
  } = {},
  deps: StreamDeps = browserDeps(),
): () => void {
  const o: StreamOptions = { ...PRESETS.panel, ...opts };
  const tokens = tokenize(text);
  const started = deps.now();
  let shown = 0;
  let steps = 0;
  let lastStep = -Infinity;
  let frame = 0;
  let timer = 0;
  let ended = false;

  const finish = (reason: NonNullable<StreamMetrics['reason']>): void => {
    if (ended) return;
    ended = true;
    deps.caf(frame);
    deps.clearTimeout(timer);
    // Bail-outs still show the whole text: a limit stops the animation, never the content.
    if (reason !== 'aborted') write(text);
    opts.onMetrics?.({ totalMs: Math.round(deps.now() - started), tokens: tokens.length, steps, reason });
    opts.onDone?.();
  };

  if (opts.signal?.aborted) {
    finish('aborted');
    return () => undefined;
  }
  opts.signal?.addEventListener('abort', () => finish('aborted'), { once: true });

  if (deps.reducedMotion || tokens.length === 0) {
    finish('reduced-motion');
    return () => finish('aborted');
  }

  const step = (now: number): void => {
    if (ended) return;
    if (now - started > o.maxMs + o.ttftMs) return finish('time-limit');
    if (now - lastStep >= o.minGapMs) {
      lastStep = now;
      const n = stepSize(tokens[shown - 1] ?? '', tokens[shown] ?? '', o.maxPerFrame, deps.random());
      shown = Math.min(tokens.length, shown + n);
      steps += 1;
      write(tokens.slice(0, shown).join(''));
      if (steps === 1) opts.onMetrics?.({ ttftMs: Math.round(deps.now() - started) });
    }
    if (shown >= tokens.length) return finish('finished');
    if (shown >= o.maxTokens) return finish('token-limit');
    frame = deps.raf(step); // yield to the browser until the next frame
  };

  timer = deps.setTimeout(() => {
    frame = deps.raf(step);
  }, o.ttftMs);

  return () => finish('aborted');
}
