'use client';

/**
 * The ⋮ action menu on a table row (Figma "Dropdown Menu"). Only actions the person may
 * take are passed in; with none, no button is shown at all.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';

import { admin, color } from '../theme';
import { Icon } from './icons';

export interface RowAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  testId?: string;
}

export function RowMenu({ label, actions, testId }: { label: string; actions: RowAction[]; testId?: string }): ReactElement | null {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (actions.length === 0) return null;
  return (
    <div ref={box} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        data-testid={testId}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: color.text.primary, borderRadius: 6 }}
      >
        <Icon name="more" />
      </button>
      {open ? (
        <ul
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            zIndex: 10,
            minWidth: 160,
            margin: 0,
            padding: 6,
            listStyle: 'none',
            backgroundColor: color.bg.canvas,
            border: `1px solid ${color.border.subtle}`,
            borderRadius: 8,
            boxShadow: `0 8px 24px ${admin.shadow}`,
          }}
        >
          {actions.map((a) => (
            <li key={a.label} role="none">
              <button
                type="button"
                role="menuitem"
                data-testid={a.testId}
                onClick={() => {
                  setOpen(false);
                  a.onSelect();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  color: a.danger ? color.error.text : color.text.primary,
                }}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
