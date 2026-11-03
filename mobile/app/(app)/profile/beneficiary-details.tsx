import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { AddBeneficiaryScreen } from '../../../src/features/profile/AddBeneficiaryScreen';
import { DESTINATION_COUNTRIES } from '../../../src/features/profile/data';
import { requestStepUp } from '../../../src/features/security/stepUp';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";
import { DemoOnly } from '../../../src/features/auth/DemoOnly';

/** Route params are untrusted: only a live corridor currency opens the form. */
function BeneficiaryDetailsRoute(): ReactElement {
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
        Alert.alert(tr("Beneficiary added"), tr("Your bank will confirm the account name."));
      }}
    />
  );
}

/** ADR-096: demo only; a release build goes to Home. */
export default function BeneficiaryDetailsRouteGuarded(): ReactElement {
  return (
    <DemoOnly>
      <BeneficiaryDetailsRoute />
    </DemoOnly>
  );
}
