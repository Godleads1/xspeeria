/**
 * Admin shell, following the Figma admin frames: a white top bar (logo, signed-in person),
 * a white side menu with the work areas, an "ADMIN" section and a red Log out, and a light
 * grey content area.
 *
 * The menu lists only the areas the signed-in person's role allows (display only — the
 * server checks every call). Figma's bell and language picker are not shown: there are no
 * admin notifications or console translations yet, and the console never shows a control
 * that does nothing.
 */

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

import { NAV_ITEMS, type NavItem } from '../../fixtures';
import { roleLabel } from '../../lib/permissions';
import { color, fontStack, space } from '../../theme';
import { Avatar } from '../Avatar';
import { Icon } from '../icons';
import { LanguagePicker } from '../LanguagePicker';
import { tr } from '../../lib/i18n';
import { Wordmark } from '../Wordmark';

const SIDEBAR = 240;
export const PAGE_BG = '#F5F6FA';

function NavLink({ item, active }: { item: NavItem; active: boolean }): ReactElement {
  return (
    <li>
      <a
        href={item.href}
        data-testid={`nav-${item.id}`}
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '2px 16px',
          padding: '10px 12px',
          color: active ? color.text.onFill : color.text.primary,
          backgroundColor: active ? color.brand.primary : 'transparent',
          fontWeight: active ? 600 : 500,
          fontSize: 14,
          textDecoration: 'none',
          borderRadius: 6,
        }}
      >
        {item.icon ? <Icon name={item.icon} /> : null}
        {tr(item.label)}
      </a>
    </li>
  );
}

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
  who?: { name: string; role: string; photo?: string | null };
  /** The href of the page being shown. */
  current?: string;
  onLogout?: () => void;
}): ReactElement {
  const held = new Set(permissions ?? []);
  const items = NAV_ITEMS.filter((i) => !i.permission || held.has(i.permission));
  const work = items.filter((i) => i.section !== 'admin');
  const admin = items.filter((i) => i.section === 'admin');
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${SIDEBAR}px 1fr`,
        gridTemplateRows: '64px 1fr',
        minHeight: '100vh',
        backgroundColor: PAGE_BG,
        fontFamily: fontStack.brand,
        color: color.text.primary,
      }}
    >
      <div
        style={{
          gridColumn: '1 / 2',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${space.md}px`,
          backgroundColor: color.bg.canvas,
        }}
      >
        <Link href="/" aria-label={tr('Xspeeria Admin home')} style={{ textDecoration: 'none' }}>
          <Wordmark size={30} />
        </Link>
      </div>
      <header
        style={{
          gridColumn: '2 / 3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: space.md,
          padding: `0 ${space.md}px`,
          backgroundColor: color.bg.canvas,
        }}
      >
        <LanguagePicker />
        {who ? (
          <a
            href="/profile"
            data-testid="who"
            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
          >
            <Avatar name={who.name} src={who.photo ?? null} size={40} />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{who.name}</span>
              <span style={{ fontSize: 12, color: color.text.secondary }}>{roleLabel(who.role)}</span>
            </span>
          </a>
        ) : null}
      </header>
      <nav
        aria-label={tr('Primary')}
        style={{
          gridColumn: '1 / 2',
          backgroundColor: color.bg.canvas,
          paddingTop: space.sm,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {work.map((item) => (
            <NavLink key={item.id} item={item} active={current === item.href} />
          ))}
        </ul>
        {admin.length > 0 ? (
          <>
            <div style={{ borderTop: `1px solid ${color.border.subtle}`, margin: '12px 0 8px' }} />
            <p style={{ margin: '4px 28px 6px', fontSize: 12, fontWeight: 600, color: color.text.secondary }}>{tr('ADMIN')}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {admin.map((item) => (
                <NavLink key={item.id} item={item} active={current === item.href} />
              ))}
            </ul>
          </>
        ) : null}
        {onLogout ? (
          <>
            <div style={{ borderTop: `1px solid ${color.border.subtle}`, margin: '12px 0 8px' }} />
            <button
              type="button"
              data-testid="logout"
              onClick={onLogout}
              style={{
                alignSelf: 'flex-start',
                margin: '4px 16px',
                paddingBlock: 10,
                paddingInlineStart: 40,
                paddingInlineEnd: 12,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: color.error.text,
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {tr('Logout')}
            </button>
          </>
        ) : null}
      </nav>
      <main
        style={{
          gridColumn: '2 / 3',
          padding: `${space.md}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: space.sm,
          minWidth: 0,
        }}
      >
        {children}
      </main>
    </div>
  );
}
