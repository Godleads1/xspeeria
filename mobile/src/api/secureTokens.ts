/**
 * Long-lived secrets on the phone (ADR-027): the refresh token and the trusted-device token
 * live only in the platform keychain/keystore (expo-secure-store), readable only while the
 * phone is unlocked and never copied to another device or backup. The access token is kept
 * in memory only and is never stored.
 *
 * Where secure storage is missing (a browser build), tokens stay in memory for the session.
 */

import * as SecureStore from 'expo-secure-store';

const REFRESH = 'xspeeria.refreshToken';
const DEVICE = 'xspeeria.deviceToken';
const memory = new Map<string, string>();

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function read(key: string): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(key, OPTIONS)) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

async function write(key: string, value: string | null): Promise<void> {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) await SecureStore.deleteItemAsync(key, OPTIONS);
    else await SecureStore.setItemAsync(key, value, OPTIONS);
  } catch {
    /* No secure storage here: the in-memory copy is used for this session only. */
  }
}

export const secureTokens = {
  refreshToken: (): Promise<string | null> => read(REFRESH),
  setRefreshToken: (value: string | null): Promise<void> => write(REFRESH, value),
  deviceToken: (): Promise<string | null> => read(DEVICE),
  setDeviceToken: (value: string | null): Promise<void> => write(DEVICE, value),
};
