/** Face ID / fingerprint via expo-local-authentication (ADR-013). */

import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricOutcome = 'ok' | 'unavailable' | 'failed';

export async function confirmWithBiometrics(prompt: string): Promise<BiometricOutcome> {
  try {
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hardware || !enrolled) return 'unavailable';
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: true, cancelLabel: 'Cancel' });
    return r.success ? 'ok' : 'failed';
  } catch {
    return 'unavailable';
  }
}
