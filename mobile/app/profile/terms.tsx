import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { TermsScreen } from '../../src/features/legal/TermsScreen';

export default function TermsRoute(): ReactElement {
  const router = useRouter();
  return <TermsScreen onBack={() => router.back()} />;
}
