'use client';

/**
 * One identity check (ADR-069): why it needs a person, what the ID says, the same document on
 * other accounts (ADR-041) or the account's existing identity (ADR-042), and the decision.
 *
 * Owner 2026-10-27: approving needs two people — one recommends with a reason, a different one
 * confirms (or declines). Rejecting needs one person; the reason is shown to the customer as
 * written. Didit's own reviews are decided in Didit's console: read-only here. The person who
 * recommended sees no Confirm button; the server and the database refuse it too.
 * Shown to staff only: the name and date of birth from the ID — never the document number
 * (Xspeeria never stores it).
 */

import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { messageFor, type KycCaseDetail } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color } from '../../theme';
import { Icon } from '../icons';
import { ReasonDialog } from '../ReasonDialog';
import { ErrorState, LoadingState } from '../primitives';
import { Toast } from '../Toast';
import { COUNTRY_NAME, KycStatusChip, REVIEW_REASON } from './KycScreen';
import { when } from './common';

export const ID_TYPE: Record<string, string> = {
  passport: 'Passport',
  national_id: 'National ID card',
  drivers_license: 'Driver’s licence',
  other: 'Other ID',
};

export const STATE_WORD: Record<string, string> = {
  approved: 'Approved',
  expired: 'Expired',
  under_review: 'Waiting',
  rejected: 'Rejected',
  active: 'Active',
  suspended: 'Suspended',
  closed: 'Closed',
};

/** Why a person must look at it, in plain words for staff. */
export function why(c: Pick<KycCaseDetail, 'review_reason' | 'in_didit'>): string {
  if (c.in_didit) return tr('Didit is reviewing this check. Decide it in Didit’s console; its answer arrives here by itself.');
  switch (c.review_reason) {
    case 'DUPLICATE_IDENTITY':
      return tr('Didit approved this ID, but the same person looks already verified on another Xspeeria account (one person, one account).');
    case 'IDENTITY_MISMATCH':
      return tr('This country’s ID doesn’t match the name or date of birth already verified on this account.');
    case 'CHECKS_INCOMPLETE':
      return tr('Some checks didn’t come back complete, so it couldn’t be approved automatically.');
    default:
      return '—';
  }
}

export function KycCaseScreen({ id }: { id: string }): ReactElement {
  const { api, me, can } = useSession();
  const [c, setC] = useState<KycCaseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'recommend' | 'reject' | 'decline' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setC(await api.kycCase(id));
    } catch (e) {
      setLoadError(messageFor(e));
    }
  }, [api, id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>, done: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDialog(null);
      setToast(done);
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState title={loadError} onRetry={() => void load()} />;
  if (!c) return <LoadingState />;

  const held = c.status === 'under_review' && !c.in_didit;
  const pending = c.reviews.find((r) => r.status === 'pending') ?? null;
  const mine = pending?.recommended_by_id === me.id;
  const mayRecommend = held && !pending && c.can_approve && can('kyc.update');
  const mayConfirm = held && pending !== null && !mine && can('kyc.approve');
  const mayReject = held && can('kyc.update') && !mine;

  return (
    <>
      <nav aria-label={tr('Breadcrumb')} style={{ fontSize: 13, color: color.text.secondary }}>
        {tr('Home')} / {tr('Admin Panel')} / <a href="/kyc" style={{ color: color.brand.secondaryText }}>{tr('Identity checks')}</a>
      </nav>
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 600 }}>{tr('Identity check')}</h1>
      <section style={{ backgroundColor: color.bg.canvas, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <a href="/kyc" aria-label={tr('Back to the list')} style={{ color: color.text.secondary, display: 'inline-flex', transform: 'rotate(90deg)' }}>
            <Icon name="chevron" size={22} />
          </a>
          <span style={{ fontSize: 18 }}>
            {c.identity.legal_name ?? c.customer.email} <span dir="ltr" style={{ color: color.text.secondary, fontSize: 14 }}>· {c.ref}</span>
          </span>
          <KycStatusChip row={{ status: c.status === 'approved' || c.status === 'rejected' ? c.status : 'under_review', review_reason: c.review_reason, awaiting_second: pending !== null }} />
        </div>
        <p data-testid="why" style={{ margin: 0, padding: '10px 14px', borderRadius: 10, backgroundColor: c.in_didit ? admin.tintBlue : admin.tintOrange, color: color.text.primary }}>
          {why(c)}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
          <Card title={tr('What the ID says')} testId="kyc-identity">
            <Field label={tr('Name')} value={c.identity.legal_name ?? '—'} />
            <Field label={tr('Date of birth')} value={c.identity.date_of_birth ?? '—'} />
            <Field label={tr('ID type')} value={c.identity.id_type ? tr(ID_TYPE[c.identity.id_type] ?? c.identity.id_type) : '—'} />
            <Field label={tr('Issued by')} value={<span dir="ltr">{c.identity.issuing_country ?? '—'}</span>} />
            <Field label={tr('Country being verified')} value={tr(COUNTRY_NAME[c.country] ?? c.country)} />
            {c.review_reason ? <Field label={tr('Why it needs a person')} value={tr(REVIEW_REASON[c.review_reason])} /> : null}
            {held && !c.can_approve ? (
              <p style={{ margin: 0, fontSize: 13, color: admin.amber }}>{tr('The name or date of birth is missing, so this check can only be rejected (the customer can check again).')}</p>
            ) : null}
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title={tr('Customer Details')} testId="kyc-customer">
              <Field label={tr('Email Address')} value={c.customer.email ?? '—'} />
              <Field label={tr('Phone Number')} value={<span dir="ltr">{c.customer.phone ?? '—'}</span>} />
              <Field label={tr('Account')} value={c.customer.account_status === 'suspended' ? tr('Suspended') : c.customer.account_status === 'closed' ? tr('Closed') : tr('Active')} />
            </Card>
            {c.same_document_elsewhere.length > 0 ? (
              <Card title={tr('Same ID on another account')} testId="kyc-elsewhere">
                {c.same_document_elsewhere.map((o) => (
                  <div key={o.user_id} style={{ fontSize: 14 }}>
                    <strong>{o.name ?? o.email}</strong> <span style={{ color: color.text.secondary }}>{o.email}</span>
                    <div style={{ fontSize: 13, color: color.text.secondary }}>
                      {tr('Check: {{check}} · Account: {{account}}', { check: tr(STATE_WORD[o.check_status] ?? o.check_status), account: tr(STATE_WORD[o.account_status] ?? o.account_status) })}
                    </div>
                  </div>
                ))}
                {c.same_document_elsewhere.some((o) => o.check_status === 'approved') ? (
                  <p style={{ margin: 0, fontSize: 13, color: admin.amber }}>{tr('While that account’s check is approved, this one can’t be approved (one ID, one account).')}</p>
                ) : null}
              </Card>
            ) : null}
            {c.account_identity.length > 0 ? (
              <Card title={tr('Already verified on this account')} testId="kyc-account">
                {c.account_identity.map((a) => (
                  <div key={a.country} style={{ fontSize: 14 }}>
                    {tr(COUNTRY_NAME[a.country] ?? a.country)}: <strong>{a.legal_name ?? '—'}</strong> · {a.date_of_birth ?? '—'}
                  </div>
                ))}
              </Card>
            ) : null}
          </div>
        </div>

        <Card title={tr('Decision')} testId="kyc-decision">
          {c.reviews.length === 0 && !c.decided_at ? <p style={{ margin: 0, color: color.text.secondary }}>{tr('No decision yet.')}</p> : null}
          {c.reviews.map((r) => (
            <div key={r.id} style={{ fontSize: 14, paddingBottom: 8, borderBottom: `1px solid ${color.border.subtle}` }}>
              <strong>{tr('{{name}} recommended approval', { name: r.recommended_by ?? '—' })}</strong> · {when(r.recommended_at)}
              <div style={{ whiteSpace: 'pre-wrap' }}>{r.reason}</div>
              {r.status === 'pending' ? (
                <div style={{ color: admin.amber, fontSize: 13 }}>{tr('Waiting for a second person to confirm')}</div>
              ) : (
                <div style={{ fontSize: 13, color: color.text.secondary }}>
                  {r.status === 'confirmed' ? tr('Confirmed by {{name}}', { name: r.decided_by ?? '—' }) : tr('Declined by {{name}}', { name: r.decided_by ?? '—' })} · {when(r.decided_at)}
                  {r.decision_note ? ` — ${r.decision_note}` : ''}
                </div>
              )}
            </div>
          ))}
          {c.status === 'rejected' && c.decision_reason ? <Field label={tr('Rejected — the customer reads')} value={c.decision_reason} /> : null}
          {mine && held ? (
            <p data-testid="own-recommendation" style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
              {tr('You recommended this, so another staff member must confirm it, decline it or reject the check.')}
            </p>
          ) : null}
        </Card>

        {error && !dialog ? (
          <p role="alert" style={{ margin: 0, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        {mayRecommend || mayConfirm || mayReject ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, paddingTop: 16, borderTop: `1px solid ${color.border.subtle}`, flexWrap: 'wrap' }}>
            {mayReject ? (
              <button type="button" data-testid="kyc-reject" onClick={() => setDialog('reject')} style={{ ...button, border: `1px solid ${color.error.fill}`, color: color.error.text, backgroundColor: color.bg.canvas }}>
                {tr('Reject')}
              </button>
            ) : null}
            {mayConfirm ? (
              <button type="button" data-testid="kyc-decline" onClick={() => setDialog('decline')} style={{ ...button, border: `1px solid ${color.border.strong}`, backgroundColor: color.bg.canvas, color: color.text.primary }}>
                {tr('Decline recommendation')}
              </button>
            ) : null}
            {mayConfirm ? (
              <button type="button" data-testid="kyc-confirm" disabled={busy} onClick={() => void run(() => api.confirmKyc(c.id), tr('Identity check approved'))} style={{ ...button, border: 'none', backgroundColor: color.success.fill, color: color.text.onFill }}>
                {tr('Confirm approval')}
              </button>
            ) : null}
            {mayRecommend ? (
              <button type="button" data-testid="kyc-recommend" onClick={() => setDialog('recommend')} style={{ ...button, border: 'none', backgroundColor: color.brand.fill, color: color.text.onFill }}>
                {tr('Recommend approval')}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      {dialog === 'recommend' ? (
        <ReasonDialog
          title={tr('Recommend approving this check?')}
          description={tr('A different staff member must confirm before the customer is verified.')}
          confirm={tr('Recommend')}
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => void run(() => api.recommendKyc(c.id, reason), tr('Sent for a second person to confirm'))}
        />
      ) : null}
      {dialog === 'decline' ? (
        <ReasonDialog
          title={tr('Decline this recommendation?')}
          description={tr('The check stays waiting; it can be recommended again or rejected.')}
          confirm={tr('Decline')}
          danger
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(note) => void run(() => api.declineKyc(c.id, note), tr('Recommendation declined'))}
        />
      ) : null}
      {dialog === 'reject' ? (
        <ReasonDialog
          title={tr('Reject this identity check?')}
          description={tr('The customer reads your reason exactly as written, so keep it short and polite.')}
          confirm={tr('Yes, Reject')}
          danger
          busy={busy}
          error={error}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => void run(() => api.rejectKyc(c.id, reason), tr('Identity check rejected'))}
        />
      ) : null}
      {toast ? <Toast key={toast + Date.now()} testId="kyc-toast" title={toast} message={tr('Saved in the audit log.')} autoHideMs={5000} /> : null}
    </>
  );
}

const button = { height: 44, padding: '0 18px', borderRadius: 8, fontFamily: 'inherit', fontSize: 15, cursor: 'pointer' } as const;

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
