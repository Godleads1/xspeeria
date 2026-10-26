'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { RolesScreen } from '../../components/screens/RolesScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/roles">
      <RolesScreen />
    </SignedIn>
  );
}
