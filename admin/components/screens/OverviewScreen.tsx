'use client';

import type { ReactElement } from 'react';

import { NAV_ITEMS, PLANNED_DESTINATIONS } from '../../fixtures';
import { roleLabel } from '../../lib/permissions';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { PageTitle } from '../forms';
import { Panel } from '../primitives';

/** The first page after log-in. No customer data yet (A-3). */
export function OverviewScreen(): ReactElement {
  const { me, can } = useSession();
  const open = NAV_ITEMS.filter((i) => i.href !== '/' && (!i.permission || can(i.permission)));
  return (
    <>
      <PageTitle crumb="Dashboard" sub={`You are signed in as ${roleLabel(me.role)}.`}>Welcome, {me.name}</PageTitle>
      <Panel>
        <h2 style={{ margin: 0, fontSize: 18 }}>What you can open</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {open.map((i) => (
            <li key={i.id}>
              <a href={i.href} style={{ color: color.brand.secondaryText }}>
                {i.label}
              </a>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <h2 style={{ margin: 0, fontSize: 18 }}>Coming next</h2>
        <p style={{ margin: 0, color: color.text.secondary }}>
          {PLANNED_DESTINATIONS.map((d) => d.label).join(', ')}. These open here once they are built,
          for the roles allowed to use them.
        </p>
      </Panel>
    </>
  );
}
