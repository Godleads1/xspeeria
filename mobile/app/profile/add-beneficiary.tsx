import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SelectCountryScreen } from '../../src/features/profile/SelectCountryScreen';

export default function AddBeneficiaryRoute(): ReactElement {
  const router = useRouter();
  return (
    <SelectCountryScreen
      onBack={() => router.back()}
      onSelect={(c) => router.push({ pathname: '/profile/beneficiary-details', params: { currency: c.currency } })}
    />
  );
}
