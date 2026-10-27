'use client';

/** The Figma list-page tools: a round search box and a "Filter By" bar with Reset Filter. */

import { useId, useRef, type ReactElement, type ReactNode } from 'react';

import { color } from '../theme';
import { tr } from '../lib/i18n';
import { Icon } from './icons';

export function SearchBox({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId?: string;
}): ReactElement {
  const id = useId();
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: 360,
        maxWidth: '100%',
        padding: '0 16px',
        height: 40,
        borderRadius: 20,
        border: `1px solid ${color.border.subtle}`,
        backgroundColor: color.bg.canvas,
        color: color.text.secondary,
      }}
    >
      <Icon name="search" size={18} />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{placeholder}</span>
      <input
        id={id}
        type="search"
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, color: color.text.primary }}
      />
    </label>
  );
}

/**
 * "Filter By | <your controls> | Reset Filter". Reset appears only when something is set.
 * The funnel and "Filter By" open the first dropdown (owner, 2026-10-27: clicking them did
 * nothing, so the filters looked broken).
 */
export function FilterBar({ children, onReset }: { children: ReactNode; onReset?: () => void }): ReactElement {
  const controls = useRef<HTMLSpanElement>(null);
  const cell = { display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderLeft: `1px solid ${color.border.subtle}` } as const;
  const openFirst = (): void => {
    const select = controls.current?.querySelector('select');
    if (!select) return;
    select.focus();
    try {
      // Opens the list where the browser allows it; otherwise the focus above lets the
      // keyboard arrows choose.
      select.showPicker();
    } catch {
      /* not supported or not allowed: focus is enough */
    }
  };
  return (
    <div
      role="group"
      aria-label={tr('Filters')}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 40,
        borderRadius: 8,
        border: `1px solid ${color.border.subtle}`,
        backgroundColor: color.bg.canvas,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <button
        type="button"
        data-testid="filter-by"
        onClick={openFirst}
        style={{ display: 'flex', alignItems: 'stretch', padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: color.text.primary }}
      >
        <span style={{ ...cell, borderLeft: 'none' }}>
          <Icon name="filter" size={18} />
        </span>
        <span style={cell}>{tr('Filter By')}</span>
      </button>
      <span ref={controls} style={cell}>
        {children}
      </span>
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          style={{ ...cell, background: 'none', border: 'none', borderLeft: `1px solid ${color.border.subtle}`, cursor: 'pointer', color: color.error.text, fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
        >
          <Icon name="reset" size={16} />
          {tr('Reset Filter')}
        </button>
      ) : null}
    </div>
  );
}

/** A bare select for use inside the filter bar. */
export function BarSelect({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  testId?: string;
}): ReactElement {
  return (
    <select
      aria-label={label}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: color.text.primary, cursor: 'pointer' }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
