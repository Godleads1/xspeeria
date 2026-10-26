/**
 * Streaming text (ADR-064): word tokens, cadence, time-to-first-token, bail-outs, abort and
 * "reduce motion". A fake clock and frame queue stand in for the browser.
 */

import { describe, expect, it, vi } from 'vitest';

import { stepSize, streamText, tokenize, type StreamDeps, type StreamMetrics } from '../lib/stream';

function fakeDeps(over: Partial<StreamDeps> = {}) {
  let t = 0;
  let frames: ((now: number) => void)[] = [];
  const timers: { at: number; cb: () => void; id: number }[] = [];
  let nextId = 1;
  const deps: StreamDeps = {
    raf: (cb) => {
      frames.push(cb);
      return nextId++;
    },
    caf: () => {
      frames = [];
    },
    setTimeout: (cb, ms) => {
      const id = nextId++;
      timers.push({ at: t + ms, cb, id });
      return id;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((x) => x.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => t,
    random: () => 0.5,
    reducedMotion: false,
    ...over,
  };
  /** Moves the clock forward one frame (16 ms), running due timers and the queued frame. */
  const tick = (ms = 16) => {
    t += ms;
    const due = timers.filter((x) => x.at <= t);
    for (const x of due) timers.splice(timers.indexOf(x), 1);
    for (const x of due) x.cb();
    const run = frames;
    frames = [];
    for (const f of run) f(t);
  };
  return { deps, tick, pendingFrames: () => frames.length, pendingTimers: () => timers.length };
}

const TEXT = 'Today so far: 3 new customers joined, 2 trades started (1 completed). No disputes are open.';

describe('tokenize', () => {
  it('splits into words with their spaces, so joining gives the text back', () => {
    const t = tokenize(TEXT);
    expect(t.join('')).toBe(TEXT);
    expect(t[0]).toBe('Today ');
    expect(tokenize('')).toEqual([]);
  });
});

describe('stepSize', () => {
  it('takes one word after punctuation (a breath)', () => {
    expect(stepSize('far: ', 'three', 3, 0.99)).toBe(1);
  });
  it('takes bigger bites over short words and smaller over long ones, within 1..max', () => {
    expect(stepSize('so ', 'a ', 3, 0.5)).toBeGreaterThan(stepSize('so ', 'reconciliation ', 3, 0.5));
    for (const r of [0, 0.3, 0.99]) {
      const n = stepSize('x ', 'of ', 3, r);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
});

describe('streamText', () => {
  it('waits for the first-token delay, writes in word chunks across frames, then finishes', () => {
    const f = fakeDeps();
    const writes: string[] = [];
    const metrics: StreamMetrics[] = [];
    const done = vi.fn();
    streamText(TEXT, (s) => writes.push(s), { ttftMs: 100, minGapMs: 0, maxPerFrame: 3, onMetrics: (m) => metrics.push(m), onDone: done }, f.deps);
    f.tick(50);
    expect(writes).toEqual([]); // nothing before the first-token delay
    for (let i = 0; i < 100 && !done.mock.calls.length; i += 1) f.tick();
    expect(done).toHaveBeenCalledTimes(1);
    expect(writes.at(-1)).toBe(TEXT);
    expect(writes.length).toBeGreaterThan(3); // streamed, not all at once
    for (const w of writes) expect(TEXT.startsWith(w)).toBe(true);
    expect(metrics[0].ttftMs).toBeGreaterThanOrEqual(100);
    expect(metrics.at(-1)?.reason).toBe('finished');
    expect(f.pendingFrames()).toBe(0);
  });

  it('respects the least gap between steps (frames in between write nothing)', () => {
    const f = fakeDeps();
    const writes: string[] = [];
    streamText(TEXT, (s) => writes.push(s), { ttftMs: 0, minGapMs: 40 }, f.deps);
    for (let i = 0; i < 6; i += 1) f.tick();
    expect(writes.length).toBeLessThanOrEqual(3);
  });

  it('bails out at the token limit and still shows the whole text', () => {
    const f = fakeDeps();
    const writes: string[] = [];
    const metrics: StreamMetrics[] = [];
    streamText(TEXT, (s) => writes.push(s), { ttftMs: 0, minGapMs: 0, maxTokens: 4, onMetrics: (m) => metrics.push(m) }, f.deps);
    for (let i = 0; i < 10; i += 1) f.tick();
    expect(writes.at(-1)).toBe(TEXT);
    expect(metrics.at(-1)?.reason).toBe('token-limit');
  });

  it('bails out at the time limit and still shows the whole text', () => {
    const f = fakeDeps();
    const writes: string[] = [];
    const metrics: StreamMetrics[] = [];
    streamText(TEXT, (s) => writes.push(s), { ttftMs: 0, minGapMs: 1000, maxMs: 50, onMetrics: (m) => metrics.push(m) }, f.deps);
    for (let i = 0; i < 10; i += 1) f.tick();
    expect(writes.at(-1)).toBe(TEXT);
    expect(metrics.at(-1)?.reason).toBe('time-limit');
  });

  it('stops on abort: no more writes, no frames or timers left', () => {
    const f = fakeDeps();
    const writes: string[] = [];
    const ctl = new AbortController();
    const done = vi.fn();
    streamText(TEXT, (s) => writes.push(s), { ttftMs: 0, minGapMs: 0, signal: ctl.signal, onDone: done }, f.deps);
    f.tick();
    f.tick();
    const before = writes.length;
    ctl.abort();
    for (let i = 0; i < 10; i += 1) f.tick();
    expect(writes.length).toBe(before);
    expect(writes.at(-1)).not.toBe(TEXT);
    expect(done).toHaveBeenCalledTimes(1);
    expect(f.pendingFrames()).toBe(0);
    expect(f.pendingTimers()).toBe(0);
  });

  it('stop() before the first word cancels the timer', () => {
    const f = fakeDeps();
    const write = vi.fn();
    const stop = streamText(TEXT, write, { ttftMs: 500 }, f.deps);
    stop();
    for (let i = 0; i < 50; i += 1) f.tick();
    expect(write).not.toHaveBeenCalled();
  });

  it('writes everything at once with "reduce motion" switched on', () => {
    const f = fakeDeps({ reducedMotion: true });
    const write = vi.fn();
    const metrics: StreamMetrics[] = [];
    streamText(TEXT, write, { onMetrics: (m) => metrics.push(m) }, f.deps);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(TEXT);
    expect(metrics[0].reason).toBe('reduced-motion');
    expect(f.pendingTimers()).toBe(0);
  });
});
