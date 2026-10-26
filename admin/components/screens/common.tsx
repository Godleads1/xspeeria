/** Small helpers shared by the signed-in admin screens. */

import type { ReactElement } from 'react';

import { StatusChip } from '../primitives';
import { language, tr } from '../../lib/i18n';

/** Times are shown in Lagos time, where the operations team works. */
export function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(language.get() === 'en-US' ? 'en-US' : language.get(), {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StaffStatus({ status, passwordSet }: { status: string; passwordSet: boolean }): ReactElement {
  if (status === 'disabled') return <StatusChip label={tr('Disabled')} tone="error" />;
  if (!passwordSet) return <StatusChip label={tr('Invited')} tone="warning" />;
  return <StatusChip label={tr('Active')} tone="success" />;
}

/** Display only: would the server let me hand out / act on a role with these permissions? */
export function withinMine(permissions: readonly string[], mine: (p: string) => boolean): boolean {
  return permissions.every(mine);
}
