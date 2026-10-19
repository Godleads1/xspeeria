import { useState, type ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { showBanner } from '../../../src/components/Banner';
import { serverPin } from '../../../src/features/auth/serverPin';
import { ChangePasswordScreen } from '../../../src/features/profile/ChangePasswordScreen';
import type { PasswordForm } from '../../../src/features/profile/passwordForm';
import { ServerCodeSheet } from '../../../src/features/security/ServerCodeSheet';
import { useThemeMode } from '../../../src/theme';

/**
 * Profile › Security › Change Password (the app's PIN). Server builds (ADR-046): the form, then
 * the authenticator code; other devices are signed out. The PINs live only in memory until sent.
 */
export default function ChangePasswordRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const [form, setForm] = useState<PasswordForm | null>(null);
  if (!SERVER_MODE) return <ChangePasswordScreen onBack={() => router.back()} />;
  return (
    <>
      <ChangePasswordScreen onBack={() => router.back()} onSubmit={setForm} />
      <ServerCodeSheet
        visible={form !== null}
        reason="Change your PIN. Other devices will be signed out."
        onCancel={() => setForm(null)}
        onSubmit={async (code) => {
          if (!form) return;
          await serverPin.change(form.oldPassword, form.newPassword, code);
          setForm(null);
          showBanner({ tone: 'success', title: 'PIN changed', message: 'Other devices have been signed out.' });
          router.back();
        }}
      />
    </>
  );
}
