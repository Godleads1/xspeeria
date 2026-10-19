/**
 * Words and links for each notification event (ADR-044). The server sends only an event name and
 * ids; the words live here so they can be translated later (languages work). Unknown events get
 * a generic line rather than nothing, so a newer server never shows a blank row.
 *
 * Links are built only from validated ids; the screen they open checks access with the server.
 */

import type { ServerNotification } from '../../api/notificationsApi';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COUNTRY: Record<string, string> = {
  NG: 'Nigeria',
  GB: 'the United Kingdom',
  US: 'the United States',
};

export type Tone = 'success' | 'warning' | 'error' | 'info';

export interface NotificationCopy {
  title: string;
  body: string;
  tone: Tone;
  /** Where tapping goes; null when there is nothing to open. */
  link: string | null;
}

function clock(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dealLink(data: Record<string, string>): string | null {
  const id = data.match_id;
  return id && UUID.test(id) ? `/market/escrow?match=${id}` : null;
}

export function notificationCopy(n: Pick<ServerNotification, 'event' | 'data'>): NotificationCopy {
  const data = n.data ?? {};
  const where = COUNTRY[data.country ?? ''];
  switch (n.event) {
    case 'kyc.approved':
      return {
        title: 'Identity verified',
        body: where ? `Your identity check for ${where} passed. You can trade now.` : 'Your identity check passed. You can trade now.',
        tone: 'success',
        link: '/profile/kyc',
      };
    case 'kyc.rejected':
      return {
        title: 'Identity check not passed',
        body: 'Open your identity check to see why and try again.',
        tone: 'error',
        link: '/profile/kyc',
      };
    case 'kyc.in_review':
      return {
        title: 'Identity check in review',
        body: 'We are looking at your check and will let you know the result.',
        tone: 'warning',
        link: '/profile/kyc',
      };
    case 'kyc.expired':
      return {
        title: 'Identity check expired',
        body: 'Verify your identity again to keep trading.',
        tone: 'warning',
        link: '/profile/kyc',
      };
    case 'match.created':
      return {
        title: 'Someone took your offer',
        body: 'Choose where you will receive your money to continue the deal.',
        tone: 'info',
        link: '/market/deals',
      };
    case 'settlement.awaiting_funding': {
      const by = clock(data.deadline);
      return {
        title: 'Time to pay in',
        body: by
          ? `Pay into escrow by ${by} to complete your deal.`
          : 'Pay into escrow within 5 minutes to complete your deal.',
        tone: 'warning',
        link: dealLink(data),
      };
    }
    case 'settlement.releasing':
      return {
        title: 'Both sides have paid',
        body: 'Your money is on its way to your account.',
        tone: 'info',
        link: dealLink(data),
      };
    case 'settlement.completed':
      return { title: 'Deal complete', body: 'Your money has been paid out.', tone: 'success', link: dealLink(data) };
    case 'settlement.cancelled':
      return {
        title: 'Deal cancelled',
        body: 'This deal was cancelled before any money moved.',
        tone: 'error',
        link: dealLink(data),
      };
    case 'settlement.unwinding':
      return {
        title: 'Refund under way',
        body: 'This deal did not complete in time. Any money paid in is being returned in full.',
        tone: 'warning',
        link: dealLink(data),
      };
    case 'settlement.refunded':
      return {
        title: 'Refund complete',
        body: 'Any money paid in for this deal, including the fee, has been returned.',
        tone: 'success',
        link: dealLink(data),
      };
    default:
      return { title: 'Update', body: 'Open Xspeeria for details.', tone: 'info', link: null };
  }
}
