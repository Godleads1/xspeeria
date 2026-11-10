'use client';

/**
 * Settings → Currencies (ADR-106, owner 2026-11-10): a Super Admin switches built-in currencies
 * on or off. Off: its offers leave the market and can't be taken; no new offers or payout
 * accounts in it; deals already matched finish. Naira is always on. The yuan also needs
 * CHINA_ENABLED on the server (legal clearance, ADR-105).
 *
 * Every staff member may look; the switch shows to Super Admins only (display only; the
 * server checks again and records each change in the audit log).
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type CurrencySwitchRow } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { color } from '../../theme';
import { Button, FormError, Notice, PageTitle } from '../forms';
import { StatusChip } from '../primitives';
import { ReasonDialog } from '../ReasonDialog';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';

const NAME: Record<string, string> = {
  NGN: 'Nigerian naira',
  USD: 'US dollar',
  GBP: 'British pound',
  EUR: 'Euro',
  CAD: 'Canadian dollar',
  CNY: 'Chinese yuan',
};

type Row = CurrencySwitchRow & { id: string };

export function CurrenciesScreen(): ReactElement {
  const { api, me } = useSession();
  const isSuper = me.role === 'super_admin';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows((await api.currencies()).map((r) => ({ ...r, id: r.currency })));
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(reason: string): Promise<void> {
    if (!asking) return;
    setBusy(true);
    setActionError(null);
    try {
      const on = !asking.enabled;
      await api.switchCurrency(asking.currency, on, reason);
      setNotice(on ? tr('{{c}} is on.', { c: asking.currency }) : tr('{{c}} is off.', { c: asking.currency }));
      setAsking(null);
      await load();
    } catch (e) {
      setActionError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Row>[] = [
    { key: 'currency', header: tr('CURRENCY'), render: (r) => <><strong>{r.currency}</strong> · {tr(NAME[r.currency] ?? r.currency)}</> },
    {
      key: 'state',
      header: tr('STATUS'),
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <StatusChip label={r.enabled ? tr('On') : tr('Off')} tone={r.enabled ? 'success' : 'neutral'} />
          {r.locked === 'china' ? <StatusChip label={tr('Waiting for legal clearance')} tone="warning" /> : null}
        </span>
      ),
    },
    {
      key: 'why',
      header: tr('LAST CHANGE'),
      render: (r) =>
        r.locked === 'naira' ? (
          <span style={{ color: color.text.secondary }}>{tr('Always on: every deal has a naira side.')}</span>
        ) : r.changed_at ? (
          <>
            {when(r.changed_at)} · {r.reason}
          </>
        ) : (
          <span style={{ color: color.text.secondary }}>{tr('Never changed')}</span>
        ),
    },
    ...(isSuper
      ? [
          {
            key: 'act',
            header: tr('ACTION'),
            render: (r: Row) =>
              r.locked === 'naira' || (r.locked === 'china' && !r.enabled) ? null : (
                <Button
                  variant="secondary"
                  testId={`switch-${r.currency}`}
                  onClick={() => {
                    setNotice(null);
                    setActionError(null);
                    setAsking(r);
                  }}
                >
                  {r.enabled ? tr('Switch off') : tr('Switch on')}
                </Button>
              ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageTitle crumb={tr('Currencies')}>{tr('Currencies')}</PageTitle>
      <p style={{ margin: 0, fontSize: 14, color: color.text.secondary }}>
        {tr('A currency that is off leaves the market: its offers are hidden and can’t be taken, and no new offers or payout accounts can be made in it. Deals already matched finish as normal.')}
      </p>
      <Notice message={notice} />
      <FormError message={error && rows ? error : null} />
      <DataTable
        caption={tr('Currencies')}
        hideCaption
        columns={columns}
        rows={rows ?? []}
        status={error && !rows ? 'error' : rows === null ? 'loading' : 'ready'}
        onRetry={() => void load()}
        emptyTitle={tr('No currencies')}
      />
      {asking ? (
        <ReasonDialog
          title={
            asking.enabled
              ? tr('Switch {{c}} off?', { c: asking.currency })
              : tr('Switch {{c}} on?', { c: asking.currency })
          }
          description={
            asking.enabled
              ? tr('Its offers leave the market at once. Deals already matched finish.')
              : tr('Its offers come back to the market at once.')
          }
          confirm={asking.enabled ? tr('Yes, Switch Off') : tr('Yes, Switch On')}
          danger={asking.enabled}
          busy={busy}
          error={actionError}
          onCancel={() => setAsking(null)}
          onConfirm={(reason) => void act(reason)}
        />
      ) : null}
    </>
  );
}
