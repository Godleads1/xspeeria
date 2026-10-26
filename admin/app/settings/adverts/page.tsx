'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../../components/SignedIn';
import { AdvertsScreen } from '../../../components/screens/AdvertsScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/settings">
      <AdvertsScreen />
    </SignedIn>
  );
}
