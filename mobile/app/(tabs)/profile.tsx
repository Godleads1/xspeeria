import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { ProfileScreen } from '../../src/features/profile/ProfileScreen';

/** Profile tab (ADR-007). Account details, Manage Beneficiaries, KYC and limits, Security and FAQ are built; other rows are coming next. */
export default function ProfileRoute(): ReactElement {
  const router = useRouter();
  return (
    <ProfileScreen
      onOpen={(destination) => {
        if (destination === 'account') router.push('/profile/account');
        else if (destination === 'beneficiaries') router.push('/profile/beneficiaries');
        else if (destination === 'kyc') router.push('/profile/kyc');
        else if (destination === 'security') router.push('/profile/security');
        else if (destination === 'faq') router.push('/profile/faq');
        else Alert.alert('Coming next', 'This screen is one of the next to be built.');
      }}
    />
  );
}
