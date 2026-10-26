'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../components/SignedIn';
import { OverviewScreen } from '../components/screens/OverviewScreen';

export default function OverviewPage(): ReactElement {
  return (
    <SignedIn current="/">
      <OverviewScreen />
    </SignedIn>
  );
}
