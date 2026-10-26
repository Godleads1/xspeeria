/**
 * Admin shell: persistent sidebar plus content region.
 *
 * Sidebar navigation is an approved admin-specific difference from mobile; the brand
 * colours, status meaning and spacing basis are shared. The menu lists only the areas the
 * signed-in person's role allows (display only — the server checks every call).
 */

import type { ReactElement, ReactNode } from 'react';

import { NAV_ITEMS } from '../../fixtures';
import { roleLabel } from '../../lib/permissions';
import { color, density, fontStack, space } from '../../theme';

export function AppShell({
  children,
  permissions,
  who,
  current,
  onLogout,
}: {
  children: ReactNode;
  /** The signed-in person's permissions; without it, only the open entries show. */
  permissions?: readonly string[];
  who?: { name: string; role: string };
  /** The href of the page being shown. */
  current?: string;
  onLogout?: () => void;
}): ReactElement {
  const held = new Set(permissions ?? []);
  const items = NAV_ITEMS.filter((i) => !i.permission || held.has(i.permission));
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        minHeight: '100vh',
        backgroundColor: color.bg.canvas,
        fontFamily: fontStack.brand,
        color: color.text.primary,
      }}
    >
      <nav
        aria-label="Primary"
        style={{
          borderRight: `1px solid ${color.border.subtle}`,
          padding: space.sm,
          backgroundColor: color.bg.sunken,
          display: 'flex',
          flexDirection: 'column',
          gap: space.sm,
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>Xspeeria Admin</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1 }}>
          {items.map((item) => {
            const active = current === item.href;
            return (
              <li key={item.id}>
                <a
                  href={item.href}
                  data-testid={`nav-${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'block',
                    padding: `${density.cellPaddingY}px ${density.cellPaddingX}px`,
                    color: active ? color.brand.primary : color.text.secondary,
                    backgroundColor: active ? color.brand.tint : 'transparent',
                    fontWeight: active ? 700 : 400,
                    textDecoration: 'none',
                    borderRadius: 8,
                  }}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
        {who ? (
          <div style={{ fontSize: 13, color: color.text.secondary }}>
            <div style={{ color: color.text.primary, fontWeight: 600 }}>{who.name}</div>
            <div>{roleLabel(who.role)}</div>
          </div>
        ) : null}
        {onLogout ? (
          <button
            type="button"
            data-testid="logout"
            onClick={onLogout}
            style={{
              background: 'none',
              border: `1px solid ${color.border.strong}`,
              borderRadius: 8,
              padding: '8px 12px',
              cursor: 'pointer',
              color: color.text.primary,
            }}
          >
            Log out
          </button>
        ) : null}
      </nav>
      <main style={{ padding: space.md, display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {children}
      </main>
    </div>
  );
}
