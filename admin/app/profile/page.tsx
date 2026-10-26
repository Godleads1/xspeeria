'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { ProfileScreen } from '../../components/screens/ProfileScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/profile">
      <ProfileScreen />
    </SignedIn>
  );
}
