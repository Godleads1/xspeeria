import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SelectCountryScreen } from '../../src/features/profile/SelectCountryScreen';

export default function AddBeneficiaryRoute(): ReactElement {
  const router = useRouter();
  return <SelectCountryScreen onBack={() => router.back()} />;
}
