'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../../../components/SignedIn';
import { DisputeCategoriesScreen } from '../../../components/screens/DisputeCategoriesScreen';

export default function Page(): ReactElement {
  return (
    <SignedIn current="/settings">
      <DisputeCategoriesScreen />
    </SignedIn>
  );
}
