'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { FraudScreen } from '../../components/screens/FraudScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/fraud">
      <FraudScreen />
    </SignedIn>
  );
}
