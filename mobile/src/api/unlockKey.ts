/**
 * The biometric unlock key (ADR-048). Kept only in the platform keychain/keystore with
 * `requireAuthentication`, so the phone releases it only after Face ID or a fingerprint.
 * Never kept in memory, AsyncStorage or a browser: where that protection is missing,
 * biometric unlock is simply not offered.
 */

import * as SecureStore from 'expo-secure-store';

import { tr } from '../i18n';

const KEY = 'xspeeria.unlockKey';

function options(): SecureStore.SecureStoreOptions {
  return {
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    requireAuthentication: true,
    authenticationPrompt: tr('Unlock Xspeeria'),
  };
}

export const unlockKey = {
  /** True when this phone can keep a key behind Face ID/fingerprint. */
  supported(): boolean {
    try {
      return SecureStore.canUseBiometricAuthentication();
    } catch {
      return false;
    }
  },
  async save(value: string): Promise<boolean> {
    try {
      await SecureStore.setItemAsync(KEY, value, options());
      return true;
    } catch {
      return false;
    }
  },
  /** Shows the Face ID/fingerprint prompt. Null when cancelled, failed or missing. */
  async read(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(KEY, options());
    } catch {
      return null;
    }
  },
  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEY, options());
    } catch {
      /* nothing stored */
    }
  },
};
