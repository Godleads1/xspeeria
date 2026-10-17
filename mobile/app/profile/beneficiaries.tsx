import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { BeneficiariesScreen } from '../../src/features/profile/BeneficiariesScreen';
import { requestStepUp } from '../../src/features/security/stepUp';

export default function BeneficiariesRoute(): ReactElement {
  const router = useRouter();
  return (
    <BeneficiariesScreen
      onBack={() => router.back()}
      onAdd={() => router.push('/profile/add-beneficiary')}
      stepUp={requestStepUp}
    />
  );
}
