'use client';

/**
 * Figma "Settings": a list of setup pages. Only those the signed-in role can open are shown
 * (display only; each page's server calls check again). Advert Placement Setup comes with
 * advert upload (ADR-056), so it is not listed yet.
 */

import type { ReactElement } from 'react';

import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { PageTitle } from '../forms';
import { Icon } from '../icons';

export function SettingsScreen(): ReactElement {
  const { can } = useSession();
  const items = [
    { href: '/roles', label: tr('Role Setup'), show: can('roles.read') },
    { href: '/settings/dispute-categories', label: tr('Dispute category Setup'), show: can('disputes.read') },
  ].filter((i) => i.show);
  return (
    <>
      <PageTitle crumb={tr('Settings')}>{tr('Settings')}</PageTitle>
      {items.length === 0 ? (
        <p style={{ color: color.text.secondary }}>{tr('Nothing to set up for your role.')}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxWidth: 840 }}>
          {items.map((i) => (
            <li key={i.href} style={{ borderBottom: `1px solid ${color.border.strong}` }}>
              <a href={i.href} data-testid={`setting-${i.href}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', color: color.text.primary, textDecoration: 'none', fontSize: 18 }}>
                {i.label}
                <span aria-hidden="true" style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
                  <Icon name="chevron" size={20} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
