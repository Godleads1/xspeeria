'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { ReversalsScreen } from '../../components/screens/ReversalsScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/reversals">
      <ReversalsScreen />
    </SignedIn>
  );
}
