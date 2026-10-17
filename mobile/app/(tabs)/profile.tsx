import type { ReactElement } from 'react';
import { useRouter, type Href } from 'expo-router';

import { ProfileScreen, type ProfileDestination } from '../../src/features/profile/ProfileScreen';

/** Every Profile row has a screen (ADR-007). A missing entry is a type error. */
const ROUTES: Record<ProfileDestination, Href> = {
  account: '/profile/account',
  beneficiaries: '/profile/beneficiaries',
  kyc: '/profile/kyc',
  security: '/profile/security',
  faq: '/profile/faq',
  support: '/profile/support',
  referral: '/profile/referral',
  terms: '/profile/terms',
};

export default function ProfileRoute(): ReactElement {
  const router = useRouter();
  return <ProfileScreen onOpen={(destination) => router.push(ROUTES[destination])} />;
}
