'use client';

/**
 * Figma "Dispute Details" (ADR-063): the case, the deal and both people on the left; the
 * resolution overview, activity timeline and conversation on the right. Actions: change status
 * (In Progress), assign, escalate (with a reason), export (print), close with an outcome.
 *
 * Buttons show only to staff whose role allows them (display only; the server checks again).
 * "Process Refund" (ADR-065) only *asks*: it sends a reversal request that another staff member
 * must approve (ADR-051 decision 4). Figma's amount box is left out: the money still in escrow
 * goes back in full, fee included (owner rule 2026-10-19), so there is no amount to type.
 */

import { useCallback, useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { messageFor, type DisputeCase, type DisputeOutcome, type StaffView } from '../../lib/api';
import { money } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color } from '../../theme';
import { Icon } from '../icons';
import { ReasonDialog } from '../ReasonDialog';
import { Toast } from '../Toast';
import { ErrorState, LoadingState, StatusChip } from '../primitives';
import { DisputeStatusChip, Sla, useServerNow } from './DisputesScreen';
import { when } from './common';
import { PRIORITY } from './RaiseDispute';
import { ReversalStatusChip } from './ReversalsScreen';

export const OUTCOMES: Record<DisputeOutcome, string> = {
  favor_initiator: 'In favour of the person who raised it',
  favor_counterparty: 'In favour of the other side',
  split: 'Shared between both sides',
  no_fault: 'No one at fault',
};

export const EVENTS: Record<string, string> = {
  created: 'Dispute created',
  dispute_opened_for_customer: 'Opened by staff for the customer',
  dispute_in_progress: 'Status changed to In Progress',
  dispute_assigned: 'Assigned',
  dispute_replied: 'Replied to the customer',
  dispute_escalated: 'Escalated',
  dispute_resolved: 'Closed',
  dispute_refund_requested: 'Refund requested',
  dispute_refund_approved: 'Refund approved',
  dispute_refund_rejected: 'Refund rejected',
};


export function DisputeCaseScreen({ id }: { id: string }): ReactElement {
  const { api, me, can } = useSession();
  const [c, setC] = useState<DisputeCase | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffView[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [closing, setClosing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const now = useServerNow(c?.now ?? null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setC(await api.dispute(id));
    } catch (e) {
      setLoadError(messageFor(e));
    }
  }, [api, id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!can('staff.read')) return;
    api.listStaff().then(
      (list) => setStaff(list.filter((s) => s.status === 'active' && s.password_set)),
      () => setStaff([]),
    );
  }, [api, can]);

  async function run(fn: () => Promise<void>, done?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) setToast(done);
      await load();
      return true;
    } catch (e) {
      setError(messageFor(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState title={loadError} onRetry={() => void load()} />;
  if (!c) return <LoadingState />;

  const open = c.status !== 'resolved';
  // ADR-065: a refund waiting for approval is decided before the case can be closed.
  const refundWaiting = c.reversals.some((rv) => rv.status === 'pending');
  const canWork = open && can('disputes.update');
  const people = staff.length > 0 ? staff : [{ id: me.id, name: me.name } as StaffView];

  return (
    <>
      <nav aria-label={tr('Breadcrumb')} style={{ fontSize: 13, color: color.text.secondary }}>
        {tr('Home')} / {tr('Admin Panel')} / <a href="/disputes" style={{ color: color.brand.secondaryText }}>{tr('Dispute Resolution')}</a>
      </nav>
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 600 }}>{tr('Dispute Details')}</h1>
      <section style={{ backgroundColor: color.bg.canvas, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <a href="/disputes" aria-label={tr('Back to the list')} style={{ color: color.text.secondary, display: 'inline-flex', transform: 'rotate(90deg)' }}>
              <Icon name="chevron" size={22} />
            </a>
            <span style={{ fontSize: 18 }}>
              {c.category_name} <span dir="ltr" style={{ color: color.text.secondary, fontSize: 14 }}>· {c.ref}</span>
            </span>
            <DisputeStatusChip status={c.status} />
            {c.escalated ? <StatusChip label={tr('Escalated')} tone="error" /> : null}
          </div>
          <div style={{ textAlign: 'end', fontSize: 13 }}>
            <div style={{ color: color.text.secondary }}>{tr('SLA Time')}</div>
            <div data-testid="case-sla" style={{ fontSize: 16 }}>
              <Sla row={c} now={now} />
            </div>
          </div>
        </div>

        <div role="toolbar" aria-label={tr('Actions')} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {canWork && c.status === 'open' ? (
            <button type="button" data-testid="mark-in-progress" disabled={busy} onClick={() => void run(() => api.startDispute(c.id), tr('Status changed to In Progress'))} style={tool}>
              {tr('Mark In Progress')}
            </button>
          ) : null}
          {canWork ? (
            <label style={{ ...tool, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>{tr('Assign/Re-assign to')}</span>
              <select
                data-testid="assign"
                aria-label={tr('Assign/Re-assign to')}
                value={c.assigned_to ?? ''}
                disabled={busy}
                onChange={(e) => void run(() => api.assignDispute(c.id, e.target.value || null), tr('Assignment saved'))}
                style={{ border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14 }}
              >
                <option value="">{tr('Nobody')}</option>
                {c.assigned_to && !people.some((p) => p.id === c.assigned_to) ? <option value={c.assigned_to}>{c.assigned_name}</option> : null}
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === me.id ? tr('{{name}} (you)', { name: p.name }) : p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {canWork ? (
            <button type="button" data-testid="escalate" onClick={() => setEscalating(true)} style={tool}>
              {tr('Escalate dispute')}
            </button>
          ) : null}
          {open && c.can_refund && can('reversals.create') ? (
            <button type="button" data-testid="process-refund" onClick={() => setRefunding(true)} style={tool}>
              {tr('Process Refund')}
            </button>
          ) : null}
          {c.reversals.map((rv) => (
            <a key={rv.id} href={`/reversals/case?id=${encodeURIComponent(rv.id)}`} data-testid={`reversal-${rv.status}`} style={{ ...tool, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
              <span dir="ltr">{rv.ref}</span>
              <ReversalStatusChip status={rv.status} />
            </a>
          ))}
          <button type="button" data-testid="export-case" onClick={() => window.print()} style={tool}>
            {tr('Export Details')}
          </button>
          {open && can('disputes.approve') && !refundWaiting ? (
            <button type="button" data-testid="close-case" onClick={() => setClosing(true)} style={{ ...tool, borderColor: admin.down, color: admin.down, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              {tr('Close')} <Icon name="close" size={14} />
            </button>
          ) : null}
        </div>
        {open && refundWaiting && can('disputes.approve') ? (
          <p data-testid="refund-waiting" style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>
            {tr('A refund for this case is waiting for approval. The case can be closed once it is approved or rejected.')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" style={{ margin: 0, color: color.error.text }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title={tr('Dispute Overview')} testId="overview">
              {c.deal ? (
                <>
                  <Field label={tr('Transaction ID')} value={<span dir="ltr">{c.deal.transaction_id}</span>} />
                  {c.deal.legs.map((l) => (
                    <Field
                      key={l.party}
                      label={l.paid_by === c.customer_details.id ? tr('Customer pays in') : tr('Other side pays in')}
                      value={
                        <span>
                          {money({ currency: l.currency, scale: l.scale, minor: l.amount_minor })}{' '}
                          <span style={{ color: color.text.secondary, fontSize: 13 }}>
                            {tr('+ fee {{fee}} · {{state}}', { fee: money({ currency: l.currency, scale: l.scale, minor: l.fee_minor }), state: l.state })}
                          </span>
                        </span>
                      }
                    />
                  ))}
                  <Field label={tr('Rate')} value={<span dir="ltr">{c.deal.rate}</span>} />
                  <Field label={tr('Escrow')} value={c.deal.escrow_paused ? tr('Paused while this dispute is open') : (c.deal.phase ?? '—')} />
                </>
              ) : (
                <Field label={tr('Type')} value={tr('Support case (no deal)')} />
              )}
              <Field label={tr('Dispute Type')} value={c.category_name} />
              <Field label={tr('Date Created')} value={when(c.created_at)} />
              <Field label={tr('Priority Level')} value={tr(PRIORITY[c.priority] ?? c.priority)} />
              <Field label={tr('Request Details')} value={<span style={{ whiteSpace: 'pre-wrap' }}>{c.description}</span>} />
              {c.desired_resolution ? <Field label={tr('Desired Resolution')} value={c.desired_resolution} /> : null}
            </Card>
            <Card title={tr('Customer Details')} testId="customer">
              <Person p={c.customer_details} />
            </Card>
            {c.deal ? (
              <Card title={tr('Other side of the deal')} testId="other-party">
                <Person p={c.deal.other_party} />
              </Card>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title={tr('Resolution Overview')} testId="resolution">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <Field label={tr('Dispute ID')} value={<span dir="ltr">{c.ref}</span>} />
                <Field label={tr('Resolution Status')} value={<DisputeStatusChip status={c.status} />} />
                <Field label={tr('Assigned Agent')} value={c.assigned_name ?? '—'} />
                <Field label={tr('Dispute Channel')} value={c.opened_by_staff ? tr('Opened by staff') : tr('Mobile APP')} />
                {c.resolved_at ? <Field label={tr('Closed')} value={when(c.resolved_at)} /> : null}
              </div>
              <h3 style={{ margin: '12px 0 4px', fontSize: 15 }}>{tr('Activity Timeline')}</h3>
              <ol data-testid="timeline" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 260, overflowY: 'auto' }}>
                {c.timeline.map((t, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, marginTop: 6, borderRadius: '50%', backgroundColor: color.brand.fill, flex: '0 0 auto' }} />
                    <span>
                      <strong style={{ fontSize: 13 }}>{t.name ?? (t.who === 'customer' ? tr('Customer') : tr('Staff'))}</strong>
                      <span style={{ display: 'block', fontSize: 13 }}>
                        {tr(EVENTS[t.event] ?? t.event)}
                        {t.detail && typeof t.detail.to === 'string' ? `: ${t.detail.to}` : ''}
                        {t.detail && typeof t.detail.outcome === 'string' ? `: ${tr(OUTCOMES[t.detail.outcome as DisputeOutcome] ?? t.detail.outcome)}` : ''}
                      </span>
                      {t.detail && typeof t.detail.reason === 'string' ? <span style={{ display: 'block', fontSize: 12, color: color.text.secondary }}>{t.detail.reason}</span> : null}
                      <span style={{ fontSize: 11, color: color.text.secondary }}>{when(t.at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
            <Card title={tr('Conversation')} testId="conversation">
              <p style={{ margin: 0, fontSize: 12, color: color.text.secondary }}>
                {tr('Each side sees only their own messages and staff replies. Staff replies go to both sides.')}
              </p>
              {c.messages.length === 0 ? <p style={{ margin: 0, color: color.text.secondary }}>{tr('No messages yet.')}</p> : null}
              {c.messages.map((m) => (
                <div key={m.id} style={{ alignSelf: m.author === 'staff' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 12px', borderRadius: 10, backgroundColor: m.author === 'staff' ? admin.bubbleStaff : admin.bubbleUser }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {m.author === 'staff' ? (m.staff_name ?? tr('Staff')) : m.author === 'customer' ? tr('Customer') : tr('Other side')}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{m.body}</div>
                  <div style={{ fontSize: 11, color: color.text.secondary }}>{when(m.created_at)}</div>
                </div>
              ))}
              {canWork ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const text = reply.trim();
                    if (!text) return;
                    void run(() => api.replyDispute(c.id, text), tr('Reply sent')).then((ok) => ok && setReply(''));
                  }}
                  style={{ display: 'flex', gap: 8 }}
                >
                  <textarea data-testid="reply" aria-label={tr('Reply to the customer')} placeholder={tr('Reply to the customer')} rows={2} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} style={{ flex: 1, fontFamily: 'inherit', fontSize: 14, padding: 8, borderRadius: 6, border: `1px solid ${color.border.strong}`, resize: 'vertical' }} />
                  <button type="submit" data-testid="send-reply" disabled={busy || !reply.trim()} style={{ ...tool, backgroundColor: color.brand.fill, color: color.text.onFill, border: 'none', opacity: busy || !reply.trim() ? 0.55 : 1 }}>
                    {tr('Send')}
                  </button>
                </form>
              ) : null}
            </Card>
          </div>
        </div>
      </section>
      {escalating ? (
        <ReasonDialog
          title={tr('Escalate Dispute')}
          confirm={tr('Escalate')}
          danger
          busy={busy}
          error={error}
          onCancel={() => setEscalating(false)}
          onConfirm={(reason) => void run(() => api.escalateDispute(c.id, reason), tr('Dispute escalated')).then((ok) => ok && setEscalating(false))}
        />
      ) : null}
      {refunding ? (
        <ReasonDialog
          title={tr('Process Refund')}
          description={tr('The money still in escrow goes back to whoever paid it in, in full (fee included). This will be sent for approval.')}
          confirm={tr('Process refund')}
          busy={busy}
          error={error}
          onCancel={() => setRefunding(false)}
          onConfirm={(reason) =>
            void run(async () => {
              await api.requestRefund(c.id, reason);
            }, tr('Refund sent for approval')).then((ok) => ok && setRefunding(false))
          }
        />
      ) : null}
      {closing ? (
        <CloseDialog
          busy={busy}
          error={error}
          onCancel={() => setClosing(false)}
          onConfirm={(outcome, note) => void run(() => api.resolveDispute(c.id, outcome, note), tr('Dispute closed')).then((ok) => ok && setClosing(false))}
        />
      ) : null}
      {toast ? <Toast key={toast + Date.now()} testId="case-toast" title={toast} message={tr('Saved in the audit log.')} autoHideMs={5000} /> : null}
    </>
  );
}

function CloseDialog({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (outcome: DisputeOutcome, note?: string) => void;
}): ReactElement {
  const [outcome, setOutcome] = useState<DisputeOutcome | ''>('');
  const [note, setNote] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-title"
        data-testid="close-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (outcome) onConfirm(outcome, note.trim() || undefined);
        }}
        style={{ width: 430, maxWidth: '100%', backgroundColor: color.bg.canvas, borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2 id="close-title" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
          {tr('Close Dispute')}
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: color.text.secondary }}>
          {tr('Are you sure you want to close this dispute? It will be marked as resolved, and the deal’s escrow continues: it pays out only if both sides paid in, otherwise the money is returned.')}
        </p>
        <label style={{ fontSize: 13 }}>
          {tr('Outcome')}
          <select data-testid="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as DisputeOutcome)} style={{ display: 'block', width: '100%', height: 40, marginTop: 4, fontFamily: 'inherit', fontSize: 14, borderRadius: 6, border: `1px solid ${color.border.strong}` }}>
            <option value="">{tr('Choose the outcome')}</option>
            {(Object.keys(OUTCOMES) as DisputeOutcome[]).map((o) => (
              <option key={o} value={o}>
                {tr(OUTCOMES[o])}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          {tr('Note (optional, saved in the audit log)')}
          <textarea data-testid="close-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, fontFamily: 'inherit', fontSize: 14, padding: 8, borderRadius: 6, border: `1px solid ${color.border.strong}` }} />
        </label>
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{ ...tool, minWidth: 90 }}>
            {tr('Cancel')}
          </button>
          <button type="submit" data-testid="close-confirm" disabled={!outcome || busy} style={{ ...tool, minWidth: 110, backgroundColor: color.brand.fill, color: color.text.onFill, border: 'none', opacity: !outcome || busy ? 0.55 : 1 }}>
            {tr('Close dispute')}
          </button>
        </div>
      </form>
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

function Person({ p }: { p: { name: string | null; email: string; phone: string; status: string } }): ReactElement {
  return (
    <>
      <Field label={tr('Customer Name')} value={p.name ?? '—'} />
      <Field label={tr('Phone Number')} value={<span dir="ltr">{p.phone}</span>} />
      <Field label={tr('Email Address')} value={p.email} />
      {p.status !== 'active' ? <Field label={tr('Account')} value={p.status === 'suspended' ? tr('Suspended') : tr('Closed')} /> : null}
    </>
  );
}

const tool: CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 6,
  border: `1px solid ${color.border.strong}`,
  backgroundColor: color.bg.canvas,
  fontFamily: 'inherit',
  fontSize: 14,
  cursor: 'pointer',
};
