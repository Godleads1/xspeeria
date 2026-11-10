import type { ReactElement } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { COUNTRY_FLAG, isKycCountry } from '../../../src/api/kycApi';
import { SERVER_MODE } from '../../../src/api/config';
import { NewLocationScreen } from '../../../src/features/auth/RegionScreens';
import { session } from '../../../src/features/auth/session';
import { regionPrompt } from '../../../src/features/kyc/regionPrompt';
import { useThemeMode } from '../../../src/theme';
import { k } from "../../../src/i18n";

const PLACE = {
  NG: { name: k("Nigeria"), currency: 'NGN' },
  GB: { name: k("United Kingdom"), currency: 'GBP' },
  US: { name: k("United States of America"), currency: 'USD' },
  CA: { name: k("Canada"), currency: 'CAD' },
  DE: { name: k("Germany"), currency: 'EUR' },
  FR: { name: k("France"), currency: 'EUR' },
  CN: { name: k("China"), currency: 'CNY' },
  EG: { name: k("Egypt"), currency: 'EGP' },
  ZA: { name: k("South Africa"), currency: 'ZAR' },
  MA: { name: k("Morocco"), currency: 'MAD' },
  ET: { name: k("Ethiopia"), currency: 'ETB' },
  KE: { name: k("Kenya"), currency: 'KES' },
  SN: { name: k("Senegal"), currency: 'XOF' },
  GH: { name: k("Ghana"), currency: 'GHS' },
  ZW: { name: k("Zimbabwe"), currency: 'USD' },
  UG: { name: k("Uganda"), currency: 'UGX' },
  ZM: { name: k("Zambia"), currency: 'ZMW' },
  TZ: { name: k("Tanzania"), currency: 'TZS' },
} as const;

/**
 * "Trade in Your New Location" (ADR-016/042). Server builds: the country comes from the
 * server's suggestion (`?country=`), Confirm opens that country's identity check, Skip changes
 * nothing. Demo: the Figma flow with a simulated US location.
 */
export default function NewLocationRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  const { country } = useLocalSearchParams<{ country?: string }>();
  if (SERVER_MODE && isKycCountry(country)) {
    return (
      <NewLocationScreen
        place={{ flag: COUNTRY_FLAG[country], ...PLACE[country], detected: true }}
        onConfirm={() => router.replace({ pathname: '/profile/kyc', params: { country } })}
        onSkip={() => {
          regionPrompt.skip(country);
          router.back();
        }}
      />
    );
  }
  return (
    <NewLocationScreen
      onConfirm={() => router.push('/region/verify')}
      onSkip={() => {
        session.clearNewRegion();
        router.replace('/');
      }}
    />
  );
}
