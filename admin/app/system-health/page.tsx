'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { SystemHealthScreen } from '../../components/screens/SystemHealthScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/system-health">
      <SystemHealthScreen />
    </SignedIn>
  );
}
