/**
 * Copying a secret (authenticator key, recovery codes) to the clipboard (SEC-04). The value
 * is cleared after CLEAR_AFTER_MS, but only if the clipboard still holds it, so something
 * the user copied since is never wiped. Other apps can read the clipboard while it is
 * there, so screens that offer this also tell the user to paste it straight away.
 */

import * as Clipboard from 'expo-clipboard';

export const CLEAR_AFTER_MS = 60 * 1000;

export interface ClipboardLike {
  setStringAsync(value: string): Promise<boolean>;
  getStringAsync(): Promise<string>;
}

export async function copySensitive(
  value: string,
  clipboard: ClipboardLike = Clipboard,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
): Promise<boolean> {
  const ok = await clipboard.setStringAsync(value);
  schedule(() => {
    clipboard
      .getStringAsync()
      .then((current) => (current === value ? clipboard.setStringAsync('') : false))
      .catch(() => undefined);
  }, CLEAR_AFTER_MS);
  return ok;
}
