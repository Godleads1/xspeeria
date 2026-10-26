'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { OutagesScreen } from '../../components/screens/OutagesScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/outages">
      <OutagesScreen />
    </SignedIn>
  );
}
