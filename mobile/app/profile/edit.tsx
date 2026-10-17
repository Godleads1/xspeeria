import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { EditProfileScreen } from '../../src/features/profile/EditProfileScreen';
import { useThemeMode } from '../../src/theme';

export default function EditProfileRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <EditProfileScreen
      onBack={() => router.back()}
      onEdit={(d) =>
        router.push(d === 'dob' ? '/profile/change-dob' : { pathname: '/profile/change-contact', params: { kind: d } })
      }
    />
  );
}
