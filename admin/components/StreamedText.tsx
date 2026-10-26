'use client';

/**
 * Shows `text` with the streaming effect from lib/stream.ts (ADR-064).
 *
 * The words are written straight into one DOM text node through a ref, so React does not
 * re-render anything while it types — the charts and tiles around it stay smooth. New text
 * aborts the old run (AbortController); leaving the page cancels everything.
 * Screen readers: `aria-busy` while typing, so the finished sentence is announced once.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';

import { PRESETS, streamText, type StreamMetrics, type StreamOptions } from '../lib/stream';
import { color } from '../theme';

export function StreamedText({
  text,
  preset = 'panel',
  options,
  onMetrics,
  testId,
  style,
}: {
  text: string;
  preset?: keyof typeof PRESETS;
  options?: Partial<StreamOptions>;
  onMetrics?: (m: StreamMetrics) => void;
  testId?: string;
  style?: CSSProperties;
}): ReactElement {
  const node = useRef<HTMLSpanElement>(null);
  const [busy, setBusy] = useState(true);
  const opts = { ...PRESETS[preset], ...options };
  const key = JSON.stringify(opts);

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const ctl = new AbortController();
    setBusy(true);
    el.textContent = '';
    streamText(
      text,
      (soFar) => {
        el.textContent = soFar;
      },
      {
        ...(JSON.parse(key) as StreamOptions),
        signal: ctl.signal,
        onMetrics: (m) => {
          onMetrics?.(m);
          if (process.env.NODE_ENV !== 'production') console.debug('[stream]', m);
        },
        onDone: () => setBusy(false),
      },
    );
    return () => ctl.abort();
    // `onMetrics` is a callback for reporting only; changing it should not restart the text.
  }, [text, key]);

  return (
    <p data-testid={testId} aria-live="polite" aria-busy={busy} style={{ margin: 0, lineHeight: 1.6, minHeight: '3.2em', ...style }}>
      <span ref={node} />
      {busy ? (
        <span
          aria-hidden="true"
          className="xs-caret"
          style={{ display: 'inline-block', width: 2, height: '1em', marginInlineStart: 2, verticalAlign: '-2px', backgroundColor: color.brand.primary }}
        />
      ) : null}
    </p>
  );
}
