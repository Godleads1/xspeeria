import type { ReactElement } from 'react';
import { useRouter, type Href } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { session } from '../../../src/features/auth/session';
import { ProfileScreen, type ProfileDestination } from '../../../src/features/profile/ProfileScreen';
import { useThemeMode } from '../../../src/theme';

/** Every Profile row has a screen (ADR-007). A missing entry is a type error. */
const ROUTES: Record<ProfileDestination, Href> = {
  account: '/profile/account',
  beneficiaries: '/profile/beneficiaries',
  // ADR-058: server builds show the real tier and limits; the demo keeps its tier cards.
  kyc: SERVER_MODE ? '/profile/limits' : '/profile/kyc',
  security: '/profile/security',
  faq: '/profile/faq',
  support: '/profile/support',
  referral: '/profile/referral',
  terms: '/profile/terms',
};

export default function ProfileRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return <ProfileScreen onOpen={(destination) => router.push(ROUTES[destination])} onLogOut={() => session.logOut()} />;
}
