import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { BeneficiariesScreen } from '../../../src/features/profile/BeneficiariesScreen';
import { requestStepUp } from '../../../src/features/security/stepUp';
import { useThemeMode } from '../../../src/theme';

export default function BeneficiariesRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <BeneficiariesScreen
      onBack={() => router.back()}
      onAdd={() => router.push('/profile/add-beneficiary')}
      stepUp={requestStepUp}
    />
  );
}
