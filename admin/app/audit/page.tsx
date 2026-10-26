'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../components/SignedIn';
import { AuditScreen } from '../../components/screens/AuditScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/audit">
      <AuditScreen />
    </SignedIn>
  );
}
