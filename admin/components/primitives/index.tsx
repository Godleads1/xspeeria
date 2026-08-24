/**
 * Admin primitives.
 *
 * Shared semantic tokens, denser presentation. Status vocabulary and meaning are
 * identical to mobile — an operator and a customer must never see the same settlement
 * described differently.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';

import { color, density, numericStyle, radius, space } from '../../theme';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'error';

const TONE: Record<StatusTone, { surface: string; border: string; text: string }> = {
  neutral: { surface: color.bg.sunken, border: color.border.strong, text: color.text.secondary },
  success: { surface: color.success.surface, border: color.success.border, text: color.success.text },
  warning: { surface: color.warning.surface, border: color.warning.border, text: color.warning.text },
  error: { surface: color.error.surface, border: color.error.border, text: color.error.text },
};

/** Status is always carried by text; the tone is additional, never the message. */
export function StatusChip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: StatusTone;
}): ReactElement {
  const palette = TONE[tone];
  return (
    <span
      data-testid={`status-${label}`}
      aria-label={`Status: ${label}`}
      style={{
        display: 'inline-block',
        backgroundColor: palette.surface,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        borderRadius: radius.md,
        padding: '2px 8px',
        fontSize: 12,
        lineHeight: '16px',
      }}
    >
      {label}
    </span>
  );
}

/**
 * The only component permitted to render a currency value in the admin. Takes integer
 * minor units with an explicit scale — never a float — and applies tabular figures so
 * numeric columns align.
 */
export function Amount({
  minor,
  currency,
  scale,
}: {
  minor: number;
  currency: string;
  scale: number;
}): ReactElement {
  if (!Number.isInteger(minor)) {
    throw new Error('Amount requires integer minor units, never a float');
  }
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const divisor = 10 ** scale;
  const whole = Math.trunc(abs / divisor);
  const fraction = scale > 0 ? String(abs % divisor).padStart(scale, '0') : '';
  const rendered = `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''} ${currency}`;

  return <span style={{ ...numericStyle, color: color.text.primary }}>{rendered}</span>;
}

export function LoadingState({ label = 'Loading' }: { label?: string }): ReactElement {
  return (
    <div role="status" aria-live="polite" style={panel}>
      {label}
    </div>
  );
}

/** Every empty state names a next action. */
/**
 * The action renders only when a label **and** a working handler are both supplied. An
 * operator console must never show a control that looks available and does nothing:
 * on an operational surface a button that appears to act is read as having acted.
 */
export function EmptyState({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}): ReactElement {
  return (
    <div style={panel}>
      <p style={{ margin: 0, color: color.text.primary }}>{title}</p>
      {actionLabel && onAction ? (
        <button type="button" style={buttonStyle} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** The retry control renders only when something can actually retry. */
export function ErrorState({
  title,
  onRetry,
}: {
  title: string;
  onRetry?: () => void;
}): ReactElement {
  return (
    <div
      role="alert"
      style={{
        ...panel,
        backgroundColor: color.error.surface,
        border: `1px solid ${color.error.border}`,
        color: color.error.text,
      }}
    >
      <p style={{ margin: 0 }}>{title}</p>
      {onRetry ? (
        <button type="button" style={buttonStyle} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Panel({ children }: { children: ReactNode }): ReactElement {
  return <section style={panel}>{children}</section>;
}

const panel: CSSProperties = {
  backgroundColor: color.bg.canvas,
  border: `1px solid ${color.border.subtle}`,
  borderRadius: radius.md,
  padding: space.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: density.cellPaddingY,
};

const buttonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  backgroundColor: color.brand.primary,
  color: color.text.onFill,
  border: 'none',
  borderRadius: radius.lg,
  padding: '10px 16px',
  cursor: 'pointer',
};
