'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { HelpRequestsScreen } from '../../components/screens/HelpRequestsScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/help-requests">
      <HelpRequestsScreen />
    </SignedIn>
  );
}
