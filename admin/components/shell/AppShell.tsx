'use client';

/**
 * Admin shell (owner-approved preview, 2026-10-26, ADR-064): a navy side menu with the
 * logo-green active item, the work areas, an "ADMIN" section and Log out; a top bar with the
 * bell, Light / Dark / System, language and the signed-in person; a light grey (or, in dark
 * mode, night) content area.
 *
 * The menu lists only the areas the signed-in person's role allows (display only — the
 * server checks every call).
 */

import Link from 'next/link';
import { useState, type ReactElement, type ReactNode } from 'react';

import { NAV_ITEMS, type NavItem } from '../../fixtures';
import { roleLabel } from '../../lib/permissions';
import { admin, color, fontStack, space } from '../../theme';
import { Avatar } from '../Avatar';
import { Icon } from '../icons';
import { LanguagePicker } from '../LanguagePicker';
import { LogoutDialog } from '../LogoutDialog';
import { NotificationBell } from '../Notifications';
import { ThemeSwitch } from '../ThemeSwitch';
import { tr } from '../../lib/i18n';
import { Wordmark } from '../Wordmark';

const SIDEBAR = 250;
export const PAGE_BG = admin.page;

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
          gap: 14,
          margin: '3px 16px',
          padding: '11px 14px',
          color: active ? '#FFFFFF' : admin.sideText,
          backgroundColor: active ? admin.sideActive : 'transparent',
          boxShadow: active ? '0 6px 16px rgba(26, 122, 50, 0.35)' : undefined,
          fontWeight: active ? 600 : 500,
          fontSize: 15,
          textDecoration: 'none',
          borderRadius: 10,
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
  const [askLogout, setAskLogout] = useState(false);
  const held = new Set(permissions ?? []);
  const items = NAV_ITEMS.filter((i) => !i.permission || held.has(i.permission));
  const work = items.filter((i) => i.section !== 'admin');
  const adminItems = items.filter((i) => i.section === 'admin');
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${SIDEBAR}px 1fr`,
        gridTemplateRows: '72px 1fr',
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
          padding: '0 26px',
          backgroundColor: color.bg.canvas,
          borderBottom: `1px solid ${color.border.subtle}`,
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
          borderBottom: `1px solid ${color.border.subtle}`,
        }}
      >
        {who ? <NotificationBell /> : null}
        <ThemeSwitch compact />
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
          backgroundColor: admin.side,
          paddingTop: space.sm,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {work.map((item) => (
            <NavLink key={item.id} item={item} active={current === item.href} />
          ))}
        </ul>
        {adminItems.length > 0 ? (
          <>
            <div style={{ borderTop: `1px solid ${admin.sideLine}`, margin: '14px 26px 8px' }} />
            <p style={{ margin: '8px 30px 6px', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: admin.sideText, opacity: 0.8 }}>{tr('ADMIN')}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {adminItems.map((item) => (
                <NavLink key={item.id} item={item} active={current === item.href} />
              ))}
            </ul>
          </>
        ) : null}
        {onLogout ? (
          <>
            <div style={{ borderTop: `1px solid ${admin.sideLine}`, margin: '14px 26px 8px' }} />
            <button
              type="button"
              data-testid="logout"
              onClick={() => setAskLogout(true)}
              style={{
                alignSelf: 'stretch',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                margin: '3px 16px',
                padding: '11px 14px',
                background: 'none',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                color: admin.sideDanger,
                fontFamily: 'inherit',
                fontSize: 15,
                fontWeight: 500,
                textAlign: 'start',
              }}
            >
              <Icon name="logout" />
              {tr('Logout')}
            </button>
          </>
        ) : null}
        {/* A faint Xspeeria mark at the bottom of the menu (decoration only). */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: -36,
            insetInlineStart: -28,
            width: 230,
            height: 120,
            opacity: 0.07,
            backgroundImage: 'url(/xspeeria-logo-dark.svg)',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            filter: 'grayscale(1)',
            pointerEvents: 'none',
          }}
        />
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
      {askLogout && onLogout ? (
        <LogoutDialog
          onCancel={() => setAskLogout(false)}
          onConfirm={() => {
            setAskLogout(false);
            onLogout();
          }}
        />
      ) : null}
    </div>
  );
}
