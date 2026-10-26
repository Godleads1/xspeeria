'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { UsersScreen } from '../../components/screens/UsersScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/users">
      <UsersScreen />
    </SignedIn>
  );
}
