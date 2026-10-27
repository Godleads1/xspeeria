'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { DealsScreen } from '../../components/screens/DealsScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/deals">
      <DealsScreen />
    </SignedIn>
  );
}
