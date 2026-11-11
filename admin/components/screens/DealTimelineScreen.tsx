'use client';

/**
 * One deal's timeline (ADR-073, Super Admin only): the summary, then every step in time order —
 * the offer, the take, the payout choices, each escrow event from the bank, holds, disputes,
 * refunds and the customers' own steps. Read-only. Xspeeria never holds the money; the escrow
 * steps are what the partner bank reported.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { messageFor, type DealEvent, type DealTimeline } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { PageTitle } from '../forms';
import { ErrorState, LoadingState, Panel } from '../primitives';
import { decimalMoney, phaseLabel } from './DealsScreen';
import { quoteOf } from '../../lib/pairs';
import { BY_LABEL, OUTCOME_LABEL, eventLabel } from './activityLabels';
import { when } from './common';

export function byLabel(by: string): string {
  return BY_LABEL[by] ? tr(BY_LABEL[by]) : by; // anything else is a staff member's name
}

/** The extra facts on one step, in plain words. */
export function eventFacts(e: DealEvent): string {
  const parts: string[] = [];
  if (e.amount) parts.push(decimalMoney(e.amount, e.currency ?? null));
  if (e.fee && e.fee !== '0.00') parts.push(tr('fee {{fee}}', { fee: decimalMoney(e.fee, e.currency ?? null) }));
  if (e.rate) parts.push(tr('rate {{rate}}', { rate: e.rate }));
  if (e.accounts) parts.push(tr('{{count}} accounts', { count: e.accounts }));
  if (e.hold) parts.push(tr(e.hold.replace(/_/g, ' ')));
  if (e.reason) parts.push(tr(e.reason.replace(/_/g, ' ')));
  if (e.outcome && e.outcome !== 'done') {
    const known = (OUTCOME_LABEL as Record<string, string>)[e.outcome];
    parts.push(tr(known ?? e.outcome.replace(/_/g, ' ')));
  }
  return parts.join(' · ');
}

function Fact({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160 }}>
      <span style={{ fontSize: 12, color: color.text.secondary }}>{label}</span>
      <span style={{ fontSize: 14, color: color.text.primary, fontWeight: 600 }}>{children}</span>
    </div>
  );
}

export function DealTimelineScreen({ id }: { id: string }): ReactElement {
  const { api } = useSession();
  const [d, setD] = useState<DealTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setD(await api.deal(id));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api, id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState title={error} onRetry={() => void load()} />;
  if (!d) return <LoadingState />;

  return (
    <>
      <PageTitle crumb={tr('Transactions')} sub={tr('Every step of this deal in time order. Nothing here can be changed.')}>
        {tr('Deal {{ref}}', { ref: d.ref })}
      </PageTitle>
      <Panel>
        <div data-testid="deal-summary" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <Fact label={tr('Status')}>{phaseLabel(d.phase)}</Fact>
          <Fact label={tr('Amount')}>{decimalMoney(d.amount, d.currency)}</Fact>
          <Fact label={tr('Rate')}>
            {tr('{{quote}} {{rate}} per {{base}}', { ...quoteOf(d.currency, d.counter_currency), rate: d.rate })}
          </Fact>
          <Fact label={tr('Exchanged for')}>{d.counter_currency}</Fact>
          <Fact label={tr('Taken (Lagos)')}>{when(d.taken_at)}</Fact>
          <Fact label={tr('Offer owner')}>
            <Link href={`/users/activity?id=${encodeURIComponent(d.offer_owner.id)}`}>{d.offer_owner.email}</Link>
          </Fact>
          <Fact label={tr('Taker')}>
            <Link href={`/users/activity?id=${encodeURIComponent(d.taker.id)}`}>{d.taker.email}</Link>
          </Fact>
          <Fact label={tr('Full ID')}>
            <span style={{ fontWeight: 400, fontSize: 12 }}>{d.match_id}</span>
          </Fact>
        </div>
      </Panel>
      <Panel>
        <h2 style={{ margin: 0, fontSize: 16 }}>{tr('Timeline')}</h2>
        <ol data-testid="deal-timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {d.events.map((e, n) => {
            const facts = eventFacts(e);
            const refused = e.outcome === 'refused' || e.outcome === 'failed' || /Failed|Expired/.test(e.kind);
            return (
              <li
                key={`${e.at}-${n}`}
                data-testid={`event-${e.kind}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '170px 16px 1fr',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: n === d.events.length - 1 ? 'none' : `1px solid ${color.border.subtle}`,
                }}
              >
                <span style={{ fontSize: 13, color: color.text.secondary }}>{when(e.at)}</span>
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    marginTop: 4,
                    borderRadius: 5,
                    backgroundColor: refused ? color.error.text : e.kind.startsWith('customer:') ? color.border.strong : color.brand.secondaryText,
                  }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: color.text.primary }}>{eventLabel(e.kind)}</span>
                  <span style={{ fontSize: 13, color: color.text.secondary }}>
                    {byLabel(e.by)}
                    {facts ? ` · ${facts}` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>
    </>
  );
}
