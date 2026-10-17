import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SelectCountryScreen } from '../../../src/features/profile/SelectCountryScreen';
import { useThemeMode } from '../../../src/theme';

export default function AddBeneficiaryRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <SelectCountryScreen
      onBack={() => router.back()}
      onSelect={(c) => router.push({ pathname: '/profile/beneficiary-details', params: { currency: c.currency } })}
    />
  );
}
