import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { FaqScreen } from '../../src/features/faq/FaqScreen';

export default function FaqRoute(): ReactElement {
  const router = useRouter();
  return <FaqScreen onBack={() => router.back()} />;
}
