'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { StaffScreen } from '../../components/screens/StaffScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/staff">
      <StaffScreen />
    </SignedIn>
  );
}
