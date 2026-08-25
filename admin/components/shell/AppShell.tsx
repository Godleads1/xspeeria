/**
 * Admin shell: persistent sidebar plus content region.
 *
 * Sidebar navigation is an approved admin-specific difference from mobile; the brand
 * colours, status meaning and spacing basis are shared.
 */

import type { ReactElement, ReactNode } from 'react';

import { NAV_ITEMS } from '../../fixtures';
import { color, density, fontStack, space } from '../../theme';

export function AppShell({ children }: { children: ReactNode }): ReactElement {
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
        }}
      >
        <p style={{ margin: `0 0 ${space.sm}px`, fontWeight: 700 }}>Xspeeria Admin</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                data-testid={`nav-${item.id}`}
                style={{
                  display: 'block',
                  padding: `${density.cellPaddingY}px ${density.cellPaddingX}px`,
                  color: color.text.secondary,
                  textDecoration: 'none',
                  borderRadius: 8,
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ padding: space.md, display: 'flex', flexDirection: 'column', gap: space.sm }}>
        {children}
      </main>
    </div>
  );
}
