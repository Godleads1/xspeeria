/**
 * The "Need help?" request this phone made (ADR-103): its id and private key, kept in the
 * keychain/keystore on this device only. Without them the answers can't be read, so a phone
 * that loses them starts a new request. Where secure storage is missing (web), it lives in
 * memory for this session only.
 */

import * as SecureStore from 'expo-secure-store';

const KEY = 'xspeeria.helpRequest';

export interface SavedHelp {
  requestId: string;
  key: string;
}

let memory: SavedHelp | null = null;

function parse(raw: string | null): SavedHelp | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedHelp>;
    return typeof v.requestId === 'string' && typeof v.key === 'string' ? { requestId: v.requestId, key: v.key } : null;
  } catch {
    return null;
  }
}

export interface HelpKeyStore {
  read(): Promise<SavedHelp | null>;
  save(v: SavedHelp): Promise<void>;
  clear(): Promise<void>;
}

export const helpKey: HelpKeyStore = {
  async read() {
    try {
      return parse(await SecureStore.getItemAsync(KEY));
    } catch {
      return memory;
    }
  },
  async save(v) {
    memory = v;
    try {
      await SecureStore.setItemAsync(KEY, JSON.stringify(v), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      // memory only (web)
    }
  },
  async clear() {
    memory = null;
    try {
      await SecureStore.deleteItemAsync(KEY);
    } catch {
      // nothing kept
    }
  },
};
