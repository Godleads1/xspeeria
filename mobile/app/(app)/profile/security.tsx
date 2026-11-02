import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { serverAuth } from '../../../src/features/auth/serverAuth';
import { SecurityScreen } from '../../../src/features/profile/SecurityScreen';
import { enableWithApproval } from '../../../src/features/security/enableBiometric';
import { useThemeMode } from '../../../src/theme';

export default function SecurityRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <SecurityScreen
      onBack={() => router.back()}
      showDevices={SERVER_MODE}
      biometric={
        SERVER_MODE
          ? {
              supported: serverAuth.biometricSupported,
              enable: () => enableWithApproval(),
              disable: () => serverAuth.disableBiometric(),
            }
          : null
      }
      onOpen={(d) =>
        router.push(
          d === 'password' ? '/profile/change-password' : d === 'devices' ? '/profile/devices' : '/profile/two-factor',
        )
      }
    />
  );
}
