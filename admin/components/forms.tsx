/**
 * Form controls for the admin console. Labels are always visible text (never only a
 * placeholder), errors are announced, and a busy button can't be pressed twice.
 */

import type { CSSProperties, FormEvent, ReactElement, ReactNode } from 'react';
import { useId } from 'react';

import { color, radius, space } from '../theme';

/** Hidden visually, still read out by screen readers. */
export const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function Field({
  label,
  hint,
  hideLabel = false,
  children,
}: {
  label: string;
  hint?: string;
  /** For controls inside a table row, where the column header already says what it is. */
  hideLabel?: boolean;
  children: (id: string, hintId: string | undefined) => ReactNode;
}): ReactElement {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={hideLabel ? visuallyHidden : { fontWeight: 600, fontSize: 14 }}>
        {label}
      </label>
      {children(id, hintId)}
      {hint ? (
        <span id={hintId} style={{ fontSize: 12, color: color.text.secondary }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
  testId,
  label,
  hint,
  required = true,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  inputMode?: 'numeric' | 'email' | 'text';
  maxLength?: number;
  testId?: string;
  label: string;
  hint?: string;
  required?: boolean;
}): ReactElement {
  return (
    <Field label={label} hint={hint}>
      {(id, hintId) => (
        <input
          id={id}
          data-testid={testId}
          type={type}
          value={value}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
          style={input}
        />
      )}
    </Field>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  testId,
  hideLabel = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  label: string;
  testId?: string;
  hideLabel?: boolean;
}): ReactElement {
  return (
    <Field label={label} hideLabel={hideLabel}>
      {(id) => (
        <select
          id={id}
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={input}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  busy = false,
  variant = 'primary',
  testId,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  testId?: string;
  disabled?: boolean;
}): ReactElement {
  const palette =
    variant === 'primary'
      ? { bg: color.brand.primary, fg: color.text.onFill, border: color.brand.primary }
      : variant === 'danger'
        ? { bg: color.bg.canvas, fg: color.error.text, border: color.error.border }
        : { bg: color.bg.canvas, fg: color.text.primary, border: color.border.strong };
  return (
    <button
      type={type}
      data-testid={testId}
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      style={{
        backgroundColor: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        borderRadius: radius.lg,
        padding: '10px 16px',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: busy || disabled ? 'not-allowed' : 'pointer',
        opacity: busy || disabled ? 0.6 : 1,
        alignSelf: 'flex-start',
      }}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }): ReactElement | null {
  if (!message) return null;
  return (
    <p
      role="alert"
      style={{
        margin: 0,
        padding: '8px 12px',
        borderRadius: radius.md,
        backgroundColor: color.error.surface,
        border: `1px solid ${color.error.border}`,
        color: color.error.text,
      }}
    >
      {message}
    </p>
  );
}

export function Notice({ message }: { message: string | null }): ReactElement | null {
  if (!message) return null;
  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: '8px 12px',
        borderRadius: radius.md,
        backgroundColor: color.success.surface,
        border: `1px solid ${color.success.border}`,
        color: color.success.text,
      }}
    >
      {message}
    </p>
  );
}

export function Form({
  onSubmit,
  children,
  label,
}: {
  onSubmit: () => void;
  children: ReactNode;
  label: string;
}): ReactElement {
  return (
    <form
      aria-label={label}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: space.sm }}
    >
      {children}
    </form>
  );
}

export const input: CSSProperties = {
  padding: '10px 12px',
  borderRadius: radius.md,
  border: `1px solid ${color.border.strong}`,
  fontSize: 15,
  fontFamily: 'inherit',
  color: color.text.primary,
  backgroundColor: color.bg.canvas,
};

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>{children}</h1>
      {sub ? <p style={{ margin: 0, color: color.text.secondary }}>{sub}</p> : null}
    </div>
  );
}
