'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../../components/SignedIn';
import { CurrenciesScreen } from '../../../components/screens/CurrenciesScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/settings">
      <CurrenciesScreen />
    </SignedIn>
  );
}
