import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AddBeneficiaryScreen } from '../../src/features/profile/AddBeneficiaryScreen';
import { DESTINATION_COUNTRIES } from '../../src/features/profile/data';
import { requestStepUp } from '../../src/features/security/stepUp';
import { useThemeMode } from '../../src/theme';

/** Route params are untrusted: only a live corridor currency opens the form. */
export default function BeneficiaryDetailsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { currency } = useLocalSearchParams<{ currency?: string }>();
  const country = DESTINATION_COUNTRIES.find((c) => c.available && c.currency === currency);
  if (!country) return <Redirect href="/profile/add-beneficiary" />;
  return (
    <AddBeneficiaryScreen
      currency={country.currency}
      onBack={() => router.back()}
      stepUp={requestStepUp}
      onDone={() => {
        router.dismissTo('/profile/beneficiaries');
        Alert.alert('Beneficiary added', 'Your bank will confirm the account name. Payouts to a new beneficiary are held for 24 hours.');
      }}
    />
  );
}
