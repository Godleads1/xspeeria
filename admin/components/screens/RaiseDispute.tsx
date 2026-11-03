'use client';

/**
 * Figma "Raise Dispute" (3 steps): a staff member opens a case for a customer (ADR-051
 * decision 6, ADR-063). Step 1: category, customer and — when it is about a deal — the deal's
 * transaction ID ("Resource ID"); step 2: what happened, the desired resolution and priority;
 * step 3: review and submit. The server applies the same rules as the app (the customer must
 * be a party to the deal; one open dispute per deal; the deal's escrow is paused).
 *
 * File attachments in the Figma come with file storage (not built yet), so there is no upload
 * box here rather than one that does nothing.
 */

import { useEffect, useId, useState, type CSSProperties, type ReactElement } from 'react';

import { messageFor, type Customer, type DisputeCategory, type Priority } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { admin, color } from '../../theme';
import { Icon } from '../icons';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PRIORITY: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export function RaiseDispute({ onCancel, onCreated }: { onCancel: () => void; onCreated: (ref: string) => void }): ReactElement {
  const { api } = useSession();
  const id = useId();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<DisputeCategory[]>([]);
  const [category, setCategory] = useState<string>('');
  const [who, setWho] = useState('');
  const [found, setFound] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deal, setDeal] = useState('');
  const [what, setWhat] = useState('');
  const [want, setWant] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .disputeCategories()
      .then((list) => setCategories(list.filter((c) => c.active)))
      .catch((e: unknown) => setError(messageFor(e)));
  }, [api]);

  useEffect(() => {
    const q = who.trim();
    if (customer || q.length < 2) {
      setFound([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .listCustomers({ search: q, status: 'active', limit: 5 })
        .then((p) => setFound(p.items))
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(t);
  }, [api, who, customer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const dealOk = deal.trim() === '' || UUID.test(deal.trim());
  const step1 = category !== '' && customer !== null && dealOk;
  const step2 = what.trim().length > 0;
  const cat = categories.find((c) => c.code === category);

  async function submit(): Promise<void> {
    if (!customer) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.openDisputeFor({
        user_id: customer.id,
        ...(deal.trim() ? { transaction_id: deal.trim() } : {}),
        category,
        description: what.trim(),
        ...(want.trim() ? { desired_resolution: want.trim() } : {}),
        priority,
      });
      onCreated(r.ref);
    } catch (e) {
      setError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'flex', justifyContent: 'flex-end' }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        data-testid="raise-dispute"
        style={{ width: 440, maxWidth: '100%', height: '100%', backgroundColor: color.bg.canvas, display: 'flex', flexDirection: 'column' }}
      >
        <header style={{ padding: '20px 24px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 id={`${id}-t`} style={{ margin: 0, fontSize: 18 }}>
              {tr('Raise Dispute')}
            </h2>
            <button type="button" aria-label={tr('Close')} onClick={onCancel} style={roundClose}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <p style={{ margin: '14px 0 6px', fontSize: 13, color: color.text.secondary }}>{tr('Step {{n}} of 3', { n: step })}</p>
          <div style={{ height: 5, borderRadius: 3, backgroundColor: admin.track }} aria-hidden="true">
            <div style={{ width: `${(step / 3) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: color.brand.fill }} />
          </div>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {step === 1 ? (
            <>
              <h3 style={h3}>{tr('Select dispute category')}</h3>
              <div role="radiogroup" aria-label={tr('Select dispute category')} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {categories.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    role="radio"
                    aria-checked={category === c.code}
                    data-testid={`cat-${c.code}`}
                    onClick={() => setCategory(c.code)}
                    style={{ ...tile, borderColor: category === c.code ? color.brand.primary : color.border.strong, boxShadow: category === c.code ? `inset 0 0 0 1px ${color.brand.primary}` : 'none' }}
                  >
                    <span style={{ fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 12, color: color.text.secondary }}>{c.description}</span>
                  </button>
                ))}
              </div>
              <Box label={tr('Customer')}>
                {customer ? (
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <span data-testid="chosen-customer">{customer.name ?? customer.email}</span>
                    <button type="button" onClick={() => { setCustomer(null); setWho(''); }} style={linkButton}>
                      {tr('Change')}
                    </button>
                  </span>
                ) : (
                  <input data-testid="customer-search" aria-label={tr('Customer')} value={who} placeholder={tr('Search name, email or phone')} onChange={(e) => setWho(e.target.value)} style={inner} />
                )}
              </Box>
              {!customer && found.length > 0 ? (
                <ul role="listbox" style={{ listStyle: 'none', margin: '-8px 0 0', padding: 0, border: `1px solid ${color.border.subtle}`, borderRadius: 6 }}>
                  {found.map((c) => (
                    <li key={c.id}>
                      <button type="button" role="option" aria-selected={false} data-testid={`pick-${c.id}`} onClick={() => setCustomer(c)} style={{ ...linkButton, display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', color: color.text.primary }}>
                        {c.name ?? '—'} <span style={{ color: color.text.secondary }}>· {c.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Box label={tr('Resource ID (if applicable)')} hint={tr('The deal’s transaction ID. Leave empty for a support case.')}>
                <input data-testid="resource-id" aria-label={tr('Resource ID (if applicable)')} dir="ltr" value={deal} onChange={(e) => setDeal(e.target.value)} placeholder="xxxxxxxx-xxxx-…" style={inner} />
              </Box>
              {!dealOk ? <p role="alert" style={{ margin: 0, fontSize: 13, color: color.error.text }}>{tr('That isn’t a transaction ID.')}</p> : null}
            </>
          ) : step === 2 ? (
            <>
              <Box label={tr('Describe the issue')}>
                <textarea data-testid="describe" aria-label={tr('Describe the issue')} rows={4} maxLength={2000} value={what} onChange={(e) => setWhat(e.target.value)} style={{ ...inner, resize: 'vertical' }} />
              </Box>
              <Box label={tr('Desired Resolution')}>
                <textarea data-testid="desired" aria-label={tr('Desired Resolution')} rows={3} maxLength={1000} value={want} onChange={(e) => setWant(e.target.value)} style={{ ...inner, resize: 'vertical' }} />
              </Box>
              <Box label={tr('Priority Level')}>
                <select data-testid="priority" aria-label={tr('Priority Level')} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} style={{ ...inner, padding: '10px 0' }}>
                  {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {tr(PRIORITY[p])}
                    </option>
                  ))}
                </select>
              </Box>
              <p style={{ margin: 0, fontSize: 12, color: color.text.secondary }}>{tr('File attachments come with file storage.')}</p>
            </>
          ) : (
            <>
              <h3 style={h3}>{tr('Review Dispute')}</h3>
              <dl data-testid="review" style={{ margin: 0, padding: 16, border: `1px solid ${color.border.strong}`, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Item label={tr('Category')} value={cat?.name ?? category} />
                <Item label={tr('Customer')} value={customer ? (customer.name ?? customer.email ?? tr('Deleted account')) : '—'} />
                <Item label={tr('Resource ID')} value={deal.trim() || tr('None (support case)')} />
                <Item label={tr('Describe the issue')} value={what.trim()} />
                <Item label={tr('Desired Resolution')} value={want.trim() || '—'} />
                <Item label={tr('Priority Level')} value={tr(PRIORITY[priority])} />
              </dl>
              {deal.trim() ? <p style={{ margin: 0, fontSize: 13, color: color.text.secondary }}>{tr('Opening a dispute pauses this deal’s escrow until it is closed.')}</p> : null}
            </>
          )}
          {error ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: color.error.text }}>
              {error}
            </p>
          ) : null}
        </div>
        <footer style={{ display: 'flex', gap: 14, padding: 16, borderTop: `1px solid ${color.border.subtle}` }}>
          <button type="button" data-testid="raise-back" onClick={() => (step === 1 ? onCancel() : setStep(step - 1))} style={{ ...big, backgroundColor: color.bg.canvas, border: `1px solid ${color.text.primary}`, color: color.text.primary }}>
            {step === 1 ? tr('Cancel') : tr('Previous')}
          </button>
          <button
            type="button"
            data-testid="raise-next"
            disabled={busy || (step === 1 && !step1) || (step === 2 && !step2)}
            onClick={() => (step < 3 ? setStep(step + 1) : void submit())}
            style={{ ...big, border: 'none', color: color.text.onFill, backgroundColor: color.brand.fill, opacity: busy || (step === 1 && !step1) || (step === 2 && !step2) ? 0.55 : 1 }}
          >
            {step < 3 ? tr('Next') : busy ? tr('Please wait…') : tr('Submit Dispute')}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Box({ label, hint, children }: { label: string; hint?: string; children: ReactElement }): ReactElement {
  return (
    <div>
      <fieldset style={{ margin: 0, padding: '0 12px 4px', border: `1px solid ${color.border.strong}`, borderRadius: 4 }}>
        <legend style={{ padding: '0 4px', fontSize: 12 }}>{label}</legend>
        {children}
      </fieldset>
      {hint ? <p style={{ margin: '4px 0 0', fontSize: 12, color: color.text.secondary }}>{hint}</p> : null}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt style={{ fontWeight: 500 }}>{label}</dt>
      <dd style={{ margin: '2px 0 0', color: color.text.secondary, wordBreak: 'break-word' }}>{value}</dd>
    </div>
  );
}

const h3: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600 };
const inner: CSSProperties = { width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15, padding: '8px 0' };
const tile: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'start', padding: 14, borderRadius: 8, border: '1px solid', background: admin.tile, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, minHeight: 88 };
const big: CSSProperties = { flex: 1, height: 50, borderRadius: 10, fontFamily: 'inherit', fontSize: 16, fontWeight: 500, cursor: 'pointer' };
const linkButton: CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: color.brand.secondaryText };
const roundClose: CSSProperties = { width: 24, height: 24, borderRadius: '50%', border: `1px solid ${color.text.secondary}`, background: 'none', cursor: 'pointer', color: color.text.secondary, display: 'grid', placeItems: 'center', padding: 0 };
