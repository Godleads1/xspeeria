'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { DisputesScreen } from '../../components/screens/DisputesScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/disputes">
      <DisputesScreen />
    </SignedIn>
  );
}
