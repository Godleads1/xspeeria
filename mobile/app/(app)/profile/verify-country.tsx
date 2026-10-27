import type { ReactElement } from 'react';
import { Redirect, useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { ChooseCountryScreen } from '../../../src/features/kyc/ChooseCountryScreen';
import { serverRegions } from '../../../src/features/kyc/serverKyc';
import { useThemeMode } from '../../../src/theme';

const source = { get: serverRegions };

/** Profile › Verify your identity: choose the country to verify (ADR-071). Demo: the old screen. */
export default function VerifyCountryRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (!SERVER_MODE) return <Redirect href="/profile/kyc" />;
  return (
    <ChooseCountryScreen
      source={source}
      onBack={() => router.back()}
      onChoose={(country) => router.push({ pathname: '/profile/kyc', params: { country } })}
    />
  );
}
