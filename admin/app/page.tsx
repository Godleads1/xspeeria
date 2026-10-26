'use client';

import type { ReactElement } from 'react';

import { SignedIn } from '../components/SignedIn';
import { DashboardScreen } from '../components/screens/DashboardScreen';
import { OverviewScreen } from '../components/screens/OverviewScreen';
import { useSession } from '../lib/session';

/** Staff whose role can read the dashboard see it; others see what they can open. */
function Home(): ReactElement {
  const { can } = useSession();
  return can('dashboard.read') ? <DashboardScreen /> : <OverviewScreen />;
}

export default function OverviewPage(): ReactElement {
  return (
    <SignedIn current="/">
      <Home />
    </SignedIn>
  );
}
