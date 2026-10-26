'use client';

/**
 * Dashboard Overview, owner-approved design (preview 2026-10-26, ADR-064): tiles with a coloured
 * edge, round icon, counting-up number and a trend line; "Customers by status" and "Trades by
 * corridor" donuts; a ranked "Top corridors" list; the "Today at a glance" summary.
 *
 * Every figure is the server's (ADR-061, real numbers only). Trend lines are drawn from the
 * server's per-day (or per-hour / per-month) series. Chart colours are theme variables whose
 * light and dark pairs were checked with the dataviz validator.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import type { Dashboard, DashboardPeriod } from '../../lib/api';
import { count, duration, money } from '../../lib/figures';
import { tr } from '../../lib/i18n';
import { admin, color } from '../../theme';
import { StreamedText } from '../StreamedText';

type Accent = 'blue' | 'green' | 'orange' | 'grey';
const ACCENT: Record<Accent, { fg: string; bg: string }> = {
  blue: { fg: admin.tintBlueFg, bg: admin.tintBlue },
  green: { fg: admin.tintGreenFg, bg: admin.tintGreen },
  orange: { fg: admin.tintOrangeFg, bg: admin.tintOrange },
  grey: { fg: admin.tintGreyFg, bg: admin.tintGrey },
};

export const ICONS = {
  users: 'M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 16c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4m1-4c2.2 0 4 1.5 4.5 4',
  newUser: 'M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8c.6-3 3-5 6-5M15 11v6M12 14h6',
  trades: 'M4 7h12l-3-3M16 13H4l3 3',
  value: 'M10 3c4 0 6 1.3 6 3s-2 3-6 3-6-1.3-6-3 2-3 6-3ZM4 6v8c0 1.7 2 3 6 3s6-1.3 6-3V6M4 10c0 1.7 2 3 6 3s6-1.3 6-3',
  fees: 'M3 7h14v8H3zM10 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM6 4h8',
  clock: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3v4l3 2',
  disputes: 'M10 3v14M4 6h12M4 6l-2 5h4zM16 6l-2 5h4zM7 17h6',
  id: 'M3 5h14v10H3zM6 9h3M6 12h5M13.5 9.5a1.5 1.5 0 1 0 0 3',
  chart: 'M4 15V9M8 15V5M12 15v-4M16 15V7',
} as const;

export const shadowCard: CSSProperties = {
  backgroundColor: color.bg.canvas,
  border: `1px solid ${color.border.subtle}`,
  borderRadius: 16,
  boxShadow: `0 6px 22px ${admin.shadow}`,
  boxSizing: 'border-box',
};

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/** A whole number that counts up from 0 (0.7 s, ease-out). Screen readers get the final value. */
export function CountUp({ value }: { value: number }): ReactElement {
  const [shown, setShown] = useState(value);
  const frame = useRef(0);
  useEffect(() => {
    if (reducedMotion() || value === 0) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setShown(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    setShown(0);
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);
  return (
    <span aria-label={count(value)}>
      <span aria-hidden="true">{count(shown)}</span>
    </span>
  );
}

/** Small trend line with a soft fill under it. Decorative: the tile states the figure. */
export function Sparkline({ values, stroke, label }: { values: number[]; stroke: string; label: string }): ReactElement | null {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const w = 96;
  const h = 36;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => [i * (w / (values.length - 1)), h - 4 - ((v - min) / (max - min || 1)) * (h - 8)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} style={{ flex: '0 0 auto' }}>
      <title>{label}</title>
      <path d={`${d}L${w},${h}L0,${h}Z`} style={{ fill: stroke, opacity: 0.14 }} />
      <path d={d} fill="none" style={{ stroke }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendLine({ c, before, lowerIsBetter = false }: { c: { pct: string; up: boolean } | null; before: string; lowerIsBetter?: boolean }): ReactElement {
  if (!c) return <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('Nothing to compare with yet')}</span>;
  const good = lowerIsBetter ? !c.up : c.up;
  const tone = good ? admin.up : admin.down;
  return (
    <span style={{ fontSize: 13, color: color.text.secondary, display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: tone, fontWeight: 700 }}>
        {c.up ? '↗' : '↘'} {c.pct}
      </span>
      {c.up ? tr('Up from {{period}}', { period: before }) : tr('Down from {{period}}', { period: before })}
    </span>
  );
}

export function Tile({
  testId,
  label,
  icon,
  accent,
  value,
  spark,
  sparkLabel,
  footer,
  index = 0,
}: {
  testId: string;
  label: string;
  icon: keyof typeof ICONS;
  accent: Accent;
  value: ReactNode;
  spark: number[];
  sparkLabel: string;
  footer?: ReactNode;
  index?: number;
}): ReactElement {
  const a = ACCENT[accent];
  return (
    <section
      data-testid={testId}
      aria-label={label}
      className="xs-rise"
      style={{ ...shadowCard, position: 'relative', overflow: 'hidden', padding: '18px 18px 16px 22px', display: 'flex', flexDirection: 'column', gap: 10, animationDelay: `${index * 40}ms` }}
    >
      <span aria-hidden="true" style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: 4, backgroundColor: a.fg }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: '50%', display: 'grid', placeItems: 'center', backgroundColor: a.bg, color: a.fg, flex: '0 0 auto' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONS[icon]} />
          </svg>
        </span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{label}</h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word', minWidth: 0 }}>{value}</div>
        <Sparkline values={spark} stroke={a.fg} label={sparkLabel} />
      </div>
      <div style={{ minHeight: 18 }}>{footer}</div>
    </section>
  );
}

/** Money per currency, one per line (never added across currencies). */
export function MoneyLines({ list }: { list: Dashboard['overview']['value'] }): ReactElement {
  if (list.length === 0) return <>0</>;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', fontSize: list.length > 1 ? 20 : undefined, lineHeight: 1.3 }}>
      {list.map((m) => (
        <span key={m.currency}>{money(m)}</span>
      ))}
    </span>
  );
}

export function Donut({ parts, centre, label, testId }: { parts: { name: string; value: number; color: string }[]; centre: string; label: string; testId: string }): ReactElement {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div data-testid={testId} style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={label} style={{ flex: '0 0 auto' }}>
        <circle r={r} cx="70" cy="70" fill="none" style={{ stroke: admin.track }} strokeWidth="22" />
        {total > 0
          ? shown.map((p) => {
              const len = (p.value / total) * c;
              const gap = shown.length > 1 ? 2 : 0;
              const el = (
                <circle
                  key={p.name}
                  r={r}
                  cx="70"
                  cy="70"
                  fill="none"
                  style={{ stroke: p.color }}
                  strokeWidth="22"
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                />
              );
              offset += len;
              return el;
            })
          : null}
        <text x="70" y="68" textAnchor="middle" fontSize="20" fontWeight="800" style={{ fill: color.text.primary }}>
          {count(total)}
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="11" style={{ fill: color.text.secondary }}>
          {centre}
        </text>
      </svg>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
        {parts.map((p) => (
          <li key={p.name} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto auto', gap: 10, alignItems: 'center' }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: p.color }} />
            <span style={{ whiteSpace: 'nowrap' }} dir="auto">
              {p.name}
            </span>
            <span style={{ color: color.text.secondary, fontVariantNumeric: 'tabular-nums' }}>{total > 0 ? `${Math.round((p.value * 1000) / total) / 10}%` : '—'}</span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{count(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Today at a glance": a few sentences built from the figures by a template (not AI). */
export function glanceText(d: Dashboard, kind: DashboardPeriod, monthName: string): string {
  const o = d.overview;
  const lead =
    kind === 'today'
      ? tr('Today so far:')
      : kind === 'month'
        ? tr('This month so far:')
        : kind === 'year'
          ? tr('This year so far:')
          : tr('In {{month}}:', { month: monthName });
  const n = o.new_users.value;
  const started = o.trades_started.value;
  const done = o.trades_completed.value;
  const parts: string[] = [];
  if (n === 0 && started === 0) parts.push(`${lead} ${tr('no new customers and no trades yet.')}`);
  else
    parts.push(
      `${lead} ${n === 1 ? tr('1 new customer joined') : tr('{{n}} new customers joined', { n: count(n) })}${tr(', ')}${
        started === 1 ? tr('1 trade started') : tr('{{n}} trades started', { n: count(started) })
      } ${tr('({{n}} completed).', { n: count(done) })}`,
    );
  const top = d.corridors[0];
  if (top && top.trades > 0) parts.push(tr('{{pair}} is the busiest corridor.', { pair: top.pair.join(' ⇄ ') }));
  const avg = duration(o.avg_settlement_seconds);
  if (avg) parts.push(tr('Settlement takes {{time}} on average.', { time: avg }));
  const disputes = o.open_disputes;
  parts.push(disputes === 0 ? tr('No disputes are open.') : disputes === 1 ? tr('1 dispute is open.') : tr('{{n}} disputes are open.', { n: count(disputes) }));
  const kyc = o.kyc_waiting;
  parts.push(kyc === 0 ? tr('No identity checks are waiting.') : kyc === 1 ? tr('1 identity check is waiting.') : tr('{{n}} identity checks are waiting.', { n: count(kyc) }));
  return parts.join(' ');
}

export function Glance({ text }: { text: string }): ReactElement {
  return (
    <section data-testid="glance" style={{ ...shadowCard, padding: '18px 22px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start' }}>
      <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', backgroundColor: admin.tintGreen, color: admin.tintGreenFg }}>
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d={ICONS.chart} />
        </svg>
      </span>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{tr('Today at a glance')}</h2>
        <StreamedText text={text} testId="glance-text" />
        <small style={{ color: color.text.secondary }}>{tr('Written from these figures by a template — not AI.')}</small>
      </div>
    </section>
  );
}

