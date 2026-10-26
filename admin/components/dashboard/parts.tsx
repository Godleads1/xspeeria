'use client';

/**
 * Dashboard building blocks after the Figma "Analytics Dashboard": stat tiles and a bar chart.
 *
 * The chart has a hover tooltip, a legend for two series, and a "Show as table" view (the
 * amber series is below 3:1 against white, so the numbers are always available as text).
 * Palette checked with the dataviz validator: #4A5BD0 / #D98A1F pass lightness, chroma, CVD
 * and normal-vision separation.
 */

import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { tr } from '../../lib/i18n';
import { admin, color } from '../../theme';

export const SERIES = [admin.series1, admin.series2] as const;

const TINTS = {
  blue: { bg: admin.tintBlue, fg: admin.tintBlueFg },
  green: { bg: admin.tintGreen, fg: admin.tintGreenFg },
  orange: { bg: admin.tintOrange, fg: admin.tintOrangeFg },
  grey: { bg: admin.tintGrey, fg: admin.tintGreyFg },
} as const;
export type Tint = keyof typeof TINTS;

export const card: CSSProperties = {
  backgroundColor: color.bg.canvas,
  borderRadius: 14,
  boxShadow: `0 4px 18px ${admin.shadow}`,
  padding: 16,
  boxSizing: 'border-box',
};

export function Trend({ change, label }: { change: { pct: string; up: boolean } | null; label: string }): ReactElement {
  if (!change) return <span style={{ fontSize: 13, color: color.text.secondary }}>{tr('Nothing to compare with yet')}</span>;
  const tone = change.up ? admin.up : admin.down;
  return (
    <span style={{ fontSize: 13, color: color.text.secondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" style={{ stroke: tone }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {change.up ? <path d="M2 11l4-4 3 3 5-5M10 5h4v4" /> : <path d="M2 5l4 4 3-3 5 5M10 11h4V7" />}
      </svg>
      <span style={{ color: tone, fontWeight: 600 }}>{change.pct}</span>
      <span>{change.up ? tr('Up from {{period}}', { period: label }) : tr('Down from {{period}}', { period: label })}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  tint,
  children,
  testId,
}: {
  label: string;
  value: ReactNode;
  tint: Tint;
  children?: ReactNode;
  testId?: string;
}): ReactElement {
  const t = TINTS[tint];
  return (
    <section data-testid={testId} aria-label={label} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 124 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: color.text.secondary }}>{label}</h3>
        <span aria-hidden="true" style={{ flex: '0 0 auto', width: 44, height: 44, borderRadius: 12, backgroundColor: t.bg, color: t.fg, display: 'grid', placeItems: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19.5C2 16 5 14 9 14s7 2 7 5.5V20H2v-.5Zm15.5.5v-.5c0-2-.8-3.6-2.1-4.8.6-.1 1.2-.2 1.6-.2 3 0 5 1.5 5 4.5v1h-4.5Z" />
          </svg>
        </span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, color: color.text.primary, wordBreak: 'break-word' }}>{value}</div>
      {children}
    </section>
  );
}

export function Grid({ children, min = 220 }: { children: ReactNode; min?: number }): ReactElement {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 16 }}>{children}</div>;
}

export interface Series {
  name: string;
  values: number[];
  /** Text for a value (tooltip and table). */
  show?: (v: number, i: number) => string;
}

/** Vertical bars per time bucket; one or two series side by side, 2px gap, rounded tops. */
export function BarChart({
  title,
  labels,
  series,
  testId,
}: {
  title: string;
  labels: string[];
  series: Series[];
  testId?: string;
}): ReactElement {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 220;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const plotH = H - pad.t - pad.b;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = (W - pad.l - pad.r) / Math.max(1, labels.length);
  const barW = Math.max(3, Math.min(14, (step - 6) / series.length - 2));
  const every = Math.ceil(labels.length / 12);
  const text = (s: Series, i: number) => (s.show ? s.show(s.values[i] ?? 0, i) : String(s.values[i] ?? 0));
  return (
    <figure data-testid={testId} style={{ margin: 0 }}>
      <figcaption style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{title}</figcaption>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title} style={{ display: 'block', maxHeight: 260 }} onMouseLeave={() => setHover(null)}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + plotH * (1 - f)} y2={pad.t + plotH * (1 - f)} style={{ stroke: color.border.subtle }} strokeDasharray="4 4" />
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} style={{ stroke: color.border.strong }} />
          {labels.map((label, i) => {
            const x0 = pad.l + step * i + (step - series.length * (barW + 2)) / 2;
            return (
              <g key={label} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + step * i} y={pad.t} width={step} height={plotH} style={{ fill: hover === i ? admin.hover : 'transparent' }} />
                {series.map((s, k) => {
                  const v = s.values[i] ?? 0;
                  const h = v === 0 ? 0 : Math.max(2, (v / max) * plotH);
                  const x = x0 + k * (barW + 2);
                  const y = pad.t + plotH - h;
                  const r = Math.min(4, barW / 2, h);
                  return h > 0 ? (
                    <path key={s.name} style={{ fill: SERIES[k] }} d={`M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${y + h}Z`} />
                  ) : null;
                })}
                {i % every === 0 ? (
                  <text x={pad.l + step * i + step / 2} y={H - 8} textAnchor="middle" fontSize="11" style={{ fill: color.text.secondary }}>
                    {label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {hover !== null ? (
          <div role="status" style={{ position: 'absolute', top: 0, left: `${Math.min(80, ((hover + 0.5) / labels.length) * 100)}%`, pointerEvents: 'none', backgroundColor: color.bg.canvas, border: `1px solid ${color.border.subtle}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, boxShadow: `0 6px 16px ${admin.shadow}`, whiteSpace: 'nowrap' }}>
            <strong>{labels[hover]}</strong>
            {series.map((s, k) => (
              <div key={s.name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: SERIES[k] }} />
                {s.name}: {text(s, hover)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {series.length > 1 ? (
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: color.text.secondary, marginTop: 6 }}>
          {series.map((s, k) => (
            <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: SERIES[k] }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      <details style={{ marginTop: 6, fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', color: color.brand.secondaryText }}>{tr('Show as table')}</summary>
        <table style={{ borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr>
              <th scope="col" style={cell}>{tr('Period')}</th>
              {series.map((s) => (
                <th key={s.name} scope="col" style={cell}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((label, i) => (
              <tr key={label}>
                <th scope="row" style={{ ...cell, fontWeight: 400 }}>{label}</th>
                {series.map((s) => (
                  <td key={s.name} style={{ ...cell, textAlign: 'end' }}>
                    {text(s, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

const cell: CSSProperties = { padding: '4px 10px', borderBottom: `1px solid ${color.border.subtle}`, textAlign: 'start' };

/** Horizontal share bar (Figma "Settlement Speed Distribution"). */
export function ShareBar({ label, part, whole }: { label: string; part: number; whole: number }): ReactElement {
  const pct = whole === 0 ? 0 : Math.round((part * 1000) / whole) / 10;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{label}</span>
        <span>
          {pct}% <span style={{ color: color.text.secondary }}>({part})</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, backgroundColor: admin.track, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color.brand.fill, borderRadius: 3 }} />
      </div>
    </div>
  );
}
