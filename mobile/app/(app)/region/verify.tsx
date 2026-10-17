import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { US_REGION, VerifyRegionScreen } from '../../../src/features/auth/RegionScreens';
import { session } from '../../../src/features/auth/session';
import { kycRegions } from '../../../src/features/profile/kycRegions';
import { useThemeMode } from '../../../src/theme';

export default function VerifyRegionRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <VerifyRegionScreen
      onSubmit={() => {
        kycRegions.submit(US_REGION);
        session.clearNewRegion();
      }}
      onDone={() => router.replace('/')}
      onCancel={() => router.back()}
    />
  );
}
