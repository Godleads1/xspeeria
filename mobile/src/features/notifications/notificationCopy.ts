/**
 * Words and links for each notification event (ADR-044). The server sends only an event name and
 * ids; the words live here so they can be translated later (languages work). Unknown events get
 * a generic line rather than nothing, so a newer server never shows a blank row.
 *
 * Links are built only from validated ids; the screen they open checks access with the server.
 */

import type { ServerNotification } from '../../api/notificationsApi';
import { tr, k } from "../../i18n";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COUNTRY: Record<string, string> = {
  NG: 'Nigeria',
  GB: k("the United Kingdom"),
  US: k("the United States"),
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
  const where = COUNTRY[data.country ?? ''] ? tr(COUNTRY[data.country ?? '']) : undefined;
  switch (n.event) {
    case 'kyc.approved':
      return {
        title: tr("Identity verified"),
        body: where ? tr("Your identity check for {{where}} passed. You can trade now.", { where }) : tr("Your identity check passed. You can trade now."),
        tone: 'success',
        link: '/profile/kyc',
      };
    case 'kyc.rejected':
      return {
        title: tr("Identity check not passed"),
        body: tr("Open your identity check to see why and try again."),
        tone: 'error',
        link: '/profile/kyc',
      };
    case 'kyc.in_review':
      return {
        title: tr("Identity check in review"),
        body: tr("We are looking at your check and will let you know the result."),
        tone: 'warning',
        link: '/profile/kyc',
      };
    case 'kyc.expired':
      return {
        title: tr("Identity check expired"),
        body: tr("Verify your identity again to keep trading."),
        tone: 'warning',
        link: '/profile/kyc',
      };
    case 'dispute.opened': {
      const id = data.dispute_id;
      return {
        title: tr("A deal is under review"),
        body: tr("The other side reported a problem, so the escrow is paused. Tell us your side."),
        tone: 'warning',
        link: id && UUID.test(id) ? `/market/case?id=${id}` : '/market/disputes',
      };
    }
    case 'dispute.reply': {
      // ADR-063: our team answered a case.
      const id = data.dispute_id;
      return {
        title: tr("Our team replied"),
        body: tr("Open your case to read the reply."),
        tone: 'info',
        link: id && UUID.test(id) ? `/market/case?id=${id}` : '/market/disputes',
      };
    }
    case 'dispute.resolved': {
      const id = data.dispute_id;
      return {
        title: tr("Your case is closed"),
        body: tr("Our team closed your case. Open it to see the outcome."),
        tone: 'info',
        link: id && UUID.test(id) ? `/market/case?id=${id}` : '/market/disputes',
      };
    }
    case 'queue.your_turn': {
      // ADR-059 Decision 4: the offer the user waited for is free for 5 minutes.
      const id = data.offer_id;
      const by = clock(data.deadline);
      return {
        title: tr("It’s your turn"),
        body: by
          ? tr("The offer you waited for is free. Take it by {{by}}.", { by })
          : tr("The offer you waited for is free. Take it within 5 minutes."),
        tone: 'warning',
        link: id && UUID.test(id) ? `/market/take?offer=${id}` : '/marketplace',
      };
    }
    case 'match.created':
      return {
        title: tr("Someone took your offer"),
        body: tr("Choose where you will receive your money to continue the deal."),
        tone: 'info',
        link: '/market/deals',
      };
    case 'settlement.awaiting_funding': {
      const by = clock(data.deadline);
      return {
        title: tr("Time to pay in"),
        body: by
          ? tr("Pay into escrow by {{by}} to complete your deal.", { by })
          : tr("Pay into escrow within 5 minutes to complete your deal."),
        tone: 'warning',
        link: dealLink(data),
      };
    }
    case 'settlement.releasing':
      return {
        title: tr("Both sides have paid"),
        body: tr("Your money is on its way to your account."),
        tone: 'info',
        link: dealLink(data),
      };
    case 'settlement.completed':
      return { title: tr("Deal complete"), body: tr("Your money has been paid out."), tone: 'success', link: dealLink(data) };
    case 'settlement.cancelled':
      return {
        title: tr("Deal cancelled"),
        body: tr("This deal was cancelled before any money moved."),
        tone: 'error',
        link: dealLink(data),
      };
    case 'settlement.unwinding':
      return {
        title: tr("Refund under way"),
        body: tr("This deal did not complete in time. Any money paid in is being returned in full."),
        tone: 'warning',
        link: dealLink(data),
      };
    case 'settlement.refunded':
      return {
        title: tr("Refund complete"),
        body: tr("Any money paid in for this deal, including the fee, has been returned."),
        tone: 'success',
        link: dealLink(data),
      };
    case 'settlement.late_money':
      // ADR-099: never returned automatically; a person checks it, then the bank returns it.
      return { title: tr("Payment arrived after the deal ended"), body: tr("This deal had already ended when your payment arrived. Our team will check it and have the bank return it to you."), tone: 'warning', link: dealLink(data) };
    default:
      return { title: 'Update', body: tr("Open Xspeeria for details."), tone: 'info', link: null };
  }
}
