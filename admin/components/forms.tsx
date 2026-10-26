/**
 * Form controls for the admin console. Labels are always visible text (never only a
 * placeholder), errors are announced, and a busy button can't be pressed twice.
 */

import type { CSSProperties, FormEvent, ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { useId } from 'react';

import { color, radius, space } from '../theme';
import { tr } from '../lib/i18n';

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
  children: (id: string, hintId: string | undefined, outlined: boolean) => ReactNode;
}): ReactElement {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  if (hideLabel) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label htmlFor={id} style={visuallyHidden}>
          {label}
        </label>
        {children(id, hintId, false)}
      </div>
    );
  }
  // Figma admin inputs: an outlined box with the label sitting on its top border.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <fieldset
        style={{
          margin: 0,
          padding: '0 12px 2px',
          border: `1px solid ${color.border.strong}`,
          borderRadius: 4,
          minWidth: 0,
        }}
      >
        <legend style={{ padding: '0 4px', fontSize: 12, color: color.text.primary }}>
          <label htmlFor={id}>{label}</label>
        </legend>
        {children(id, hintId, true)}
      </fieldset>
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
  placeholder,
  required = true,
  ltr,
  readOnly = false,
  leading,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Always left to right (emails, phone numbers, passwords, codes), also in Arabic. */
  ltr?: boolean;
  /** Shown but not editable (e.g. my email and role on My profile). */
  readOnly?: boolean;
  /** Something drawn before the text inside the box, e.g. a flag. */
  leading?: ReactNode;
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
      {(id, hintId, outlined) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {leading}
          <input
            id={id}
            data-testid={testId}
            type={type}
            value={value}
            placeholder={placeholder}
            dir={(ltr ?? (type === 'email' || type === 'password')) ? 'ltr' : undefined}
            required={required && !readOnly}
            readOnly={readOnly}
            aria-readonly={readOnly || undefined}
            autoComplete={autoComplete}
            inputMode={inputMode}
            maxLength={maxLength}
            aria-describedby={hintId}
            onChange={(e) => onChange(e.target.value)}
            style={{
              ...(outlined ? inner : input),
              ...(readOnly ? { color: color.text.secondary, cursor: 'default' } : null),
            }}
          />
        </span>
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
      {(id, _hint, outlined) => (
        <select
          id={id}
          data-testid={testId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={outlined ? inner : input}
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
  block = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  testId?: string;
  disabled?: boolean;
  /** Full width (Figma log-in button). */
  block?: boolean;
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
        borderRadius: 8,
        padding: '10px 20px',
        minHeight: 40,
        fontWeight: 600,
        fontFamily: 'inherit',
        width: block ? '100%' : undefined,
        boxShadow: variant === 'primary' ? '0 4px 10px rgba(0, 26, 110, 0.25)' : undefined,
        cursor: busy || disabled ? 'not-allowed' : 'pointer',
        opacity: busy || disabled ? 0.6 : 1,
        alignSelf: block ? 'stretch' : 'flex-start',
      }}
    >
      {busy ? tr('Please wait…') : children}
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

/** Inside the outlined box: the box draws the border. */
const inner: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 0 10px',
  border: 'none',
  outline: 'none',
  fontSize: 15,
  fontFamily: 'inherit',
  color: color.text.primary,
  backgroundColor: 'transparent',
  textAlign: 'start',
};

export const input: CSSProperties = {
  padding: '10px 12px',
  borderRadius: radius.md,
  border: `1px solid ${color.border.strong}`,
  fontSize: 15,
  fontFamily: 'inherit',
  color: color.text.primary,
  backgroundColor: color.bg.canvas,
};

/** Figma admin page header: breadcrumb, title, and an optional main action on the right. */
export function PageTitle({
  children,
  sub,
  crumb,
  action,
}: {
  children: ReactNode;
  sub?: string;
  /** Last breadcrumb step, e.g. "Staff" (shown as Home / Admin Panel / Staff). */
  crumb?: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {crumb ? (
          <nav aria-label={tr('Breadcrumb')} style={{ fontSize: 13, color: color.text.secondary }}>
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              {tr('Home')}
            </Link>
            {'  /  '}{tr('Admin Panel')}{'  /  '}
            <span aria-current="page" style={{ color: color.brand.secondaryText }}>
              {crumb}
            </span>
          </nav>
        ) : null}
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>{children}</h1>
        {sub ? <p style={{ margin: 0, color: color.text.secondary }}>{sub}</p> : null}
      </div>
      {action ?? null}
    </div>
  );
}
