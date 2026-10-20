import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../src/api/config';
import { CheckScreen } from '../../src/features/auth/ServerScreens';
import { serverAuth } from '../../src/features/auth/serverAuth';
import { useThemeMode } from '../../src/theme';
import { tr } from '../../src/i18n';

/**
 * Server mode (ADR-054): the second check after the PIN on a new phone, or after the SMS
 * code at sign-up — email/SMS codes before the identity check, a face check after it.
 */
export default function CheckRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const check = serverAuth.check();
  if (!SERVER_MODE || !check) return <Redirect href="/login" />;
  return (
    <CheckScreen
      check={check}
      codes={(email, sms) => serverAuth.checkCodes(email, sms, Date.now())}
      faceStart={() => serverAuth.faceStart()}
      faceFinish={() => serverAuth.faceFinish(Date.now())}
      openUrl={async (url) => {
        await Linking.openURL(url);
      }}
      onDone={(outcome) => router.replace(outcome === 'signedUp' ? '/signup/done' : '/')}
      onRestart={(message) => {
        if (message) Alert.alert(tr('Please start again'), message);
        router.replace('/login');
      }}
    />
  );
}
