import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SelectCountryScreen } from '../../../src/features/profile/SelectCountryScreen';
import { useThemeMode } from '../../../src/theme';
import { DemoOnly } from '../../../src/features/auth/DemoOnly';

function AddBeneficiaryRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <SelectCountryScreen
      onBack={() => router.back()}
      onSelect={(c) => router.push({ pathname: '/profile/beneficiary-details', params: { currency: c.currency } })}
    />
  );
}

/** ADR-096: demo only; a release build goes to Home. */
export default function AddBeneficiaryRouteGuarded(): ReactElement {
  return (
    <DemoOnly>
      <AddBeneficiaryRoute />
    </DemoOnly>
  );
}
