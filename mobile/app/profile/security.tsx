import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { SecurityScreen } from '../../src/features/profile/SecurityScreen';

export default function SecurityRoute(): ReactElement {
  const router = useRouter();
  return (
    <SecurityScreen
      onBack={() => router.back()}
      onOpen={(d) => {
        if (d === 'password') router.push('/profile/change-password');
        else Alert.alert('2 FA authentication', '2 FA authentication is one of the next screens to be built.');
      }}
    />
  );
}
