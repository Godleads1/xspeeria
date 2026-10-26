'use client';

/** Reading a chosen photo file and showing staff photos (ADR-049, ADR-060). */

import { useEffect, useState } from 'react';

import type { AdminApi } from './api';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The file as base64, or a reason it can't be used. The server checks it again. */
export function readPhoto(file: File): Promise<{ base64: string } | { error: string }> {
  if (!PHOTO_TYPES.includes(file.type)) return Promise.resolve({ error: 'Choose a JPG, PNG or WebP photo.' });
  if (file.size > MAX_PHOTO_BYTES) return Promise.resolve({ error: 'The photo must be smaller than 5 MB.' });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const comma = text.indexOf(',');
      resolve(comma > 0 ? { base64: text.slice(comma + 1) } : { error: 'That file could not be read.' });
    };
    reader.onerror = () => resolve({ error: 'That file could not be read.' });
    reader.readAsDataURL(file);
  });
}

/** A staff photo's local URL while shown; `version` changes reload it. */
export function useStaffPhoto(api: AdminApi, staffId: string | null, hasPhoto: boolean, version = 0): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!staffId || !hasPhoto) {
      setUrl(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    void api.photoUrl(staffId).then((u) => {
      made = u;
      if (alive) setUrl(u);
      else if (u) URL.revokeObjectURL(u);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [api, staffId, hasPhoto, version]);
  return url;
}
