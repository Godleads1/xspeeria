'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { SettingsScreen } from '../../components/screens/SettingsScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/settings">
      <SettingsScreen />
    </SignedIn>
  );
}
