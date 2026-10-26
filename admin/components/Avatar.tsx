'use client';

/** A staff member's photo, or their initials when there is none. */

import { useRef, useState, type ReactElement } from 'react';

import { readPhoto } from '../lib/photos';
import { color } from '../theme';
import { tr } from '../lib/i18n';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export function Avatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }): ReactElement {
  if (src) {
    return (
      // A local object URL from the server's cleaned photo; next/image can't take blob: URLs.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        backgroundColor: color.brand.tint,
        color: color.brand.primary,
        fontWeight: 700,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Figma "Edit Photo": a round camera button that opens the file picker. Calls `onPick` with
 * the file as base64 and a preview URL (the server checks and cleans it when saved).
 */
export function PhotoPicker({
  preview,
  onPick,
  onRemove,
  testId,
}: {
  preview: string | null;
  onPick: (photo: { base64: string; preview: string }) => void;
  onRemove?: () => void;
  testId?: string;
}): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          aria-label={preview ? tr('Change photo') : tr('Add photo')}
          onClick={() => input.current?.click()}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            backgroundColor: color.bg.sunken,
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" width={72} height={72} style={{ width: 72, height: 72, objectFit: 'cover' }} />
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill={color.text.primary} aria-hidden="true">
              <path d="M9 4.5 7.6 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.6L15 4.5H9Zm3 4a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => input.current?.click()}
          style={{ background: 'none', border: 'none', color: color.brand.secondaryText, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
        >
          {tr('Edit Photo')}
        </button>
        {preview && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            style={{ background: 'none', border: 'none', color: color.error.text, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
          >
            {tr('Remove')}
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        data-testid={testId}
        aria-label={tr('Photo file')}
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const r = await readPhoto(file);
          if ('error' in r) {
            setError(tr(r.error));
            return;
          }
          setError(null);
          onPick({ base64: r.base64, preview: URL.createObjectURL(file) });
        }}
      />
      {error ? (
        <span role="alert" style={{ fontSize: 13, color: color.error.text }}>
          {error}
        </span>
      ) : null}
      <span style={{ fontSize: 12, color: color.text.secondary }}>{tr('JPG, PNG or WebP, up to 5 MB.')}</span>
    </div>
  );
}
