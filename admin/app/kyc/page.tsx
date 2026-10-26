'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { KycScreen } from '../../components/screens/KycScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/kyc">
      <KycScreen />
    </SignedIn>
  );
}
