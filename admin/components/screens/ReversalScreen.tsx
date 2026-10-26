'use client';

/**
 * Figma "Reversal Details" (ADR-065): the request and what goes back to whom on the left, the
 * customer and the deal on the right; "Reject Request" and "Approve Request" at the bottom.
 *
 * Rules shown here are checked again on the server:
 * - Only staff with `reversals.approve` decide, and **never on their own request** (ADR-051
 *   decision 4) — the buttons are replaced by a note for the person who asked.
 * - Approving returns the money still in escrow to whoever paid it in, in full (fee included);
 *   the partner bank does the returning. Rejecting needs a reason.
 * Design corrections: Figma shows the full account number and a bank name; the money goes back to
 * the account it came from, so no account is shown (and never more than the last 4 digits).
 */

import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { messageFor, type ReversalDetail } from '../../lib/api';
import { money } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color } from '../../theme';
import { Icon } from '../icons';
import { ReasonDialog } from '../ReasonDialog';
import { Toast } from '../Toast';
import { ErrorState, LoadingState } from '../primitives';
import { ReversalStatusChip } from './ReversalsScreen';
import { when } from './common';

/** Deal phases in plain words (ADR-001 names stay in the data). */
export const PHASE_LABEL: Record<string, string> = {
  AWAITING_FUNDING: 'Waiting for payment into escrow',
  RELEASING: 'Paying out',
  COMPLETED: 'Completed',
  UNWINDING: 'Returning the money',
  CLOSED_UNWOUND: 'Money returned',
  CANCELLED: 'Cancelled',
  INITIALIZING: 'Opening escrow',
};

export function ReversalScreen({ id }: { id: string }): ReactElement {
  const { api, me, can } = useSession();
  const [r, setR] = useState<ReversalDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setR(await api.reversal(id));
    } catch (e) {
      setLoadError(messageFor(e));
    }
  }, [api, id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(fn: () => Promise<void>, title: string, message: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDialog(null);
      setToast({ title, message });
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState title={loadError} onRetry={() => void load()} />;
  if (!r) return <LoadingState />;

  const pending = r.status === 'pending';
  const own = r.requested_by_id === me.id;
  const mayDecide = pending && can('reversals.approve') && !own;

  return (
    <>
      <nav aria-label={tr('Breadcrumb')} style={{ fontSize: 13, color: color.text.secondary }}>
        {tr('Home')} / {tr('Admin Panel')} / <a href="/reversals" style={{ color: color.brand.secondaryText }}>{tr('Reversal')}</a>
      </nav>
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 600 }}>{tr('Reversal Details')}</h1>
      <section style={{ backgroundColor: color.bg.canvas, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <a href="/reversals" aria-label={tr('Back to the list')} style={{ color: color.text.secondary, display: 'inline-flex', transform: 'rotate(90deg)' }}>
            <Icon name="chevron" size={22} />
          </a>
          <span style={{ fontSize: 18 }}>
            {r.dispute.category_name} <span dir="ltr" style={{ color: color.text.secondary, fontSize: 14 }}>· {r.ref}</span>
          </span>
          <ReversalStatusChip status={r.status} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
          <Card title={tr('Reversal Overview')} testId="reversal-overview">
            <Field label={tr('Transaction ID')} value={<span dir="ltr">{r.deal.transaction_id}</span>} />
            <Field
              label={tr('Money going back')}
              value={
                r.returns.length === 0 ? (
                  '—'
                ) : (
                  <ul data-testid="returns" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {r.returns.map((x) => (
                      <li key={x.currency}>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(x)}</strong>{' '}
                        <span style={{ color: color.text.secondary, fontSize: 13 }}>{tr('to {{name}}, who paid it in (fee included)', { name: x.name ?? x.email ?? '—' })}</span>
                      </li>
                    ))}
                  </ul>
                )
              }
            />
            <Field label={tr('Dispute Type')} value={<a href={`/disputes/case?id=${encodeURIComponent(r.dispute.id)}`} style={{ color: color.brand.secondaryText }}>{`${r.dispute.category_name} · ${r.dispute.ref}`}</a>} />
            <Field label={tr('Date Created')} value={when(r.requested_at)} />
            <Field label={tr('Initiated By')} value={r.requested_by ?? '—'} />
            <Field label={tr('Request Details')} value={<span style={{ whiteSpace: 'pre-wrap' }}>{r.reason}</span>} />
            <Field label={tr('What the customer said')} value={<span style={{ whiteSpace: 'pre-wrap' }}>{r.dispute.description}</span>} />
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title={tr('Customer Details')} testId="reversal-customer">
              <Field label={tr('Customer Name')} value={r.customer.name ?? '—'} />
              <Field label={tr('Phone Number')} value={<span dir="ltr">{r.customer.phone ?? '—'}</span>} />
              <Field label={tr('Email Address')} value={r.customer.email ?? '—'} />
            </Card>
            <Card title={tr('Deal')} testId="reversal-deal">
              <Field label={tr('Escrow')} value={tr(PHASE_LABEL[r.deal.phase] ?? r.deal.phase)} />
              {r.status !== 'pending' ? (
                <>
                  <Field label={r.status === 'approved' ? tr('Approved by') : tr('Rejected by')} value={r.decided_by ?? '—'} />
                  {r.decided_at ? <Field label={tr('Decided')} value={when(r.decided_at)} /> : null}
                  {r.decision_note ? <Field label={tr('Note')} value={r.decision_note} /> : null}
                </>
              ) : null}
            </Card>
          </div>
        </div>

        {error && !dialog ? (
          <p role="alert" style={{ margin: 0, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        {pending ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, paddingTop: 16, borderTop: `1px solid ${color.border.subtle}`, flexWrap: 'wrap' }}>
            {own ? (
              <p data-testid="own-request" style={{ margin: 0, color: color.text.secondary }}>
                {tr('You asked for this refund, so another staff member must approve or reject it.')}
              </p>
            ) : null}
            {!own && !r.can_return ? (
              <p style={{ margin: 0, color: admin.amber }}>{tr('This deal’s escrow can no longer be returned. You can reject the request with a note.')}</p>
            ) : null}
            {mayDecide ? (
              <>
                <button type="button" data-testid="reject" onClick={() => setDialog('reject')} style={{ height: 48, padding: '0 28px', borderRadius: 10, border: `1px solid ${color.error.fill}`, background: color.bg.canvas, color: color.error.text, fontFamily: 'inherit', fontSize: 16, cursor: 'pointer' }}>
                  {tr('Reject Request')}
                </button>
                <button type="button" data-testid="approve" disabled={!r.can_return} onClick={() => setDialog('approve')} style={{ height: 48, padding: '0 28px', borderRadius: 10, border: 'none', backgroundColor: color.brand.fill, color: color.text.onFill, fontFamily: 'inherit', fontSize: 16, cursor: r.can_return ? 'pointer' : 'not-allowed', opacity: r.can_return ? 1 : 0.55 }}>
                  {tr('Approve Request')}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>
      {dialog === 'approve' ? (
        <ApproveDialog
          detail={r}
          busy={busy}
          error={error}
          onCancel={() => {
            setDialog(null);
            setError(null);
          }}
          onConfirm={() =>
            void decide(
              () => api.approveReversal(r.id),
              tr('Request Approved Successfully'),
              tr('The Reversal request with ID {{id}} has been approved successfully', { id: r.ref }),
            )
          }
        />
      ) : null}
      {dialog === 'reject' ? (
        <ReasonDialog
          title={tr('Are you sure you want to Reject this request?')}
          confirm={tr('Yes, Reject')}
          danger
          busy={busy}
          error={error}
          onCancel={() => {
            setDialog(null);
            setError(null);
          }}
          onConfirm={(note) =>
            void decide(
              () => api.rejectReversal(r.id, note),
              tr('Request Rejected Successfully'),
              tr('The Reversal request with ID {{id}} has been rejected successfully', { id: r.ref }),
            )
          }
        />
      ) : null}
      {toast ? <Toast key={toast.title} testId="reversal-toast" title={toast.title} message={toast.message} autoHideMs={6000} /> : null}
    </>
  );
}

function ApproveDialog({
  detail,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  detail: ReversalDetail;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const button = { flex: 1, height: 48, borderRadius: 10, fontFamily: 'inherit', fontSize: 16, fontWeight: 500, cursor: 'pointer' } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="approve-title" data-testid="approve-dialog" style={{ width: 420, maxWidth: '100%', backgroundColor: color.bg.canvas, borderRadius: 6, boxShadow: `0 16px 40px ${admin.shadow}` }}>
        <p id="approve-title" style={{ margin: 0, padding: '28px 28px 8px', fontSize: 18, fontWeight: 500, textAlign: 'center' }}>
          {tr('Are you sure you want to Approve this request?')}
        </p>
        <p style={{ margin: '0 28px', fontSize: 14, color: color.text.secondary, textAlign: 'center', lineHeight: 1.45 }}>
          {tr('The partner bank returns this money to the people who paid it in. This can’t be undone.')}
        </p>
        <ul style={{ margin: '12px 28px 0', padding: 0, listStyle: 'none', textAlign: 'center', fontWeight: 600 }}>
          {detail.returns.map((x) => (
            <li key={x.currency}>{money(x)}</li>
          ))}
        </ul>
        {error ? (
          <p role="alert" style={{ margin: '8px 28px 0', fontSize: 13, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 14, padding: 16, marginTop: 16, borderTop: `1px solid ${color.border.subtle}` }}>
          <button type="button" data-testid="approve-cancel" onClick={onCancel} style={{ ...button, backgroundColor: color.bg.canvas, border: `1px solid ${color.text.primary}`, color: color.text.primary }}>
            {tr('No, Cancel')}
          </button>
          <button type="button" data-testid="approve-confirm" disabled={busy} onClick={onConfirm} style={{ ...button, border: 'none', color: color.text.onFill, backgroundColor: color.success.fill, opacity: busy ? 0.55 : 1 }}>
            {tr('Yes, Approve')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, testId, children }: { title: string; testId?: string; children: ReactNode }): ReactElement {
  return (
    <section data-testid={testId} aria-label={title} style={{ border: `1px solid ${color.border.subtle}`, borderRadius: 14, overflow: 'hidden' }}>
      <h2 style={{ margin: 0, padding: '10px 14px', fontSize: 15, fontWeight: 600, backgroundColor: color.bg.sunken }}>{title}</h2>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div>
      <div style={{ fontSize: 13, color: color.text.secondary }}>{label}</div>
      <div style={{ fontSize: 15 }}>{value}</div>
    </div>
  );
}
