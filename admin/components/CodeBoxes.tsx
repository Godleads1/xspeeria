'use client';

/**
 * Figma Two-Factor Authentication: six boxes, one digit each. Typing moves to the next box,
 * Backspace on an empty box goes back, and pasting (or the browser filling in the code from
 * the email) fills every box at once.
 */

import { useRef, type ClipboardEvent, type KeyboardEvent, type ReactElement } from 'react';

import { tr } from '../lib/i18n';
import { admin, color } from '../theme';

const LENGTH = 6;

export function CodeBoxes({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (code: string) => void;
  testId?: string;
}): ReactElement {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '');

  const focus = (i: number) => boxes.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  function put(at: number, typed: string): void {
    const clean = typed.replace(/\D/g, '');
    if (!clean) return;
    const next = digits.slice();
    for (let j = 0; j < clean.length && at + j < LENGTH; j += 1) next[at + j] = clean[j] ?? '';
    onChange(next.join('').slice(0, LENGTH));
    focus(at + clean.length);
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) next[i] = '';
      else if (i > 0) {
        next[i - 1] = '';
        focus(i - 1);
      }
      onChange(next.join(''));
    } else if (e.key === 'ArrowLeft') focus(document.dir === 'rtl' ? i + 1 : i - 1);
    else if (e.key === 'ArrowRight') focus(document.dir === 'rtl' ? i - 1 : i + 1);
  }

  return (
    <div
      role="group"
      aria-label={tr('6-digit code')}
      // Digits always read left to right, also in Arabic.
      dir="ltr"
      style={{ display: 'flex', gap: 10, justifyContent: 'space-between', maxWidth: 370 }}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          data-testid={i === 0 ? testId : `${testId}-${i}`}
          aria-label={tr('Digit {{n}} of 6', { n: i + 1 })}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          value={d}
          onChange={(e) => put(i, e.target.value.slice(d ? 1 : 0) || e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
            e.preventDefault();
            put(i, e.clipboardData.getData('text'));
          }}
          onFocus={(e) => e.target.select()}
          style={{
            width: 48,
            height: 48,
            boxSizing: 'border-box',
            textAlign: 'center',
            fontSize: 20,
            fontFamily: 'inherit',
            fontWeight: 600,
            color: color.text.primary,
            backgroundColor: admin.field,
            border: `1px solid ${color.border.strong}`,
            borderRadius: 6,
            marginInlineStart: i === 3 ? 6 : 0,
          }}
        />
      ))}
    </div>
  );
}
