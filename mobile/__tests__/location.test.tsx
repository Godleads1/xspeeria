/**
 * Location for the KYC region (ADR-022): asked only on "Let's get started", country only,
 * never required, coordinates never kept.
 */

import { render, screen, waitFor } from '@testing-library/react-native';

import { GetStartedScreen } from '../src/features/auth/SignupScreens';
import { cleanCountryCode, detectCountry, type LocationApi } from '../src/features/auth/location';
import { signup } from '../src/features/auth/signupStore';

function fakeApi(over: Partial<{ granted: boolean; grantOnAsk: boolean; country: string | null; fail: boolean }> = {}): LocationApi & { asked: jest.Mock } {
  const o = { granted: false, grantOnAsk: true, country: 'NG', fail: false, ...over };
  const asked = jest.fn(async () => ({ granted: o.grantOnAsk }));
  return {
    asked,
    getForegroundPermissionsAsync: async () => ({ granted: o.granted }),
    requestForegroundPermissionsAsync: asked,
    getCurrentPositionAsync: async () => {
      if (o.fail) throw new Error('no fix');
      return { coords: { latitude: 6.5244, longitude: 3.3792 } };
    },
    reverseGeocodeAsync: async () => [{ isoCountryCode: o.country }],
  };
}

beforeEach(() => signup.clear());

describe('detectCountry', () => {
  it('asks once, then returns only the country code', async () => {
    const api = fakeApi();
    const r = await detectCountry({ ask: true, api });
    expect(r).toEqual({ status: 'found', country: 'NG' });
    expect(api.asked).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(r)).not.toMatch(/6\.52|3\.37|latitude|longitude/);
  });

  it('declined: denied, and nothing else is attempted', async () => {
    const api = fakeApi({ grantOnAsk: false });
    const pos = jest.spyOn(api, 'getCurrentPositionAsync');
    expect(await detectCountry({ ask: true, api })).toEqual({ status: 'denied' });
    expect(pos).not.toHaveBeenCalled();
  });

  it('never prompts when ask is false (log-in)', async () => {
    const api = fakeApi();
    expect(await detectCountry({ ask: false, api })).toEqual({ status: 'denied' });
    expect(api.asked).not.toHaveBeenCalled();
  });

  it('already granted: no prompt, still country only', async () => {
    const api = fakeApi({ granted: true, country: 'gb' });
    expect(await detectCountry({ ask: true, api })).toEqual({ status: 'found', country: 'GB' });
    expect(api.asked).not.toHaveBeenCalled();
  });

  it('any failure is unknown, never an error', async () => {
    expect(await detectCountry({ ask: true, api: fakeApi({ fail: true }) })).toEqual({ status: 'unknown' });
    expect(await detectCountry({ ask: true, api: fakeApi({ country: null }) })).toEqual({ status: 'unknown' });
  });

  it('a junk country code from the geocoder is ignored', async () => {
    expect(await detectCountry({ ask: true, api: fakeApi({ country: 'Nigeria<script>' }) })).toEqual({ status: 'unknown' });
    expect(cleanCountryCode(' us ')).toBe('US');
    expect(cleanCountryCode('USA')).toBeNull();
    expect(cleanCountryCode(42)).toBeNull();
  });
});

describe("Let's get started", () => {
  it('asks for location as the screen opens and keeps only the country in the sign-up draft', async () => {
    const detect = jest.fn(async () => ({ status: 'found' as const, country: 'NG' }));
    await render(<GetStartedScreen onNext={jest.fn()} onLogIn={jest.fn()} onTerms={jest.fn()} detect={detect} />);
    expect(detect).toHaveBeenCalledWith({ ask: true });
    await waitFor(() => expect(signup.get().country).toBe('NG'));
    expect(JSON.stringify(signup.get())).not.toMatch(/latitude|longitude/);
  });

  it('declining does not block sign-up', async () => {
    const detect = jest.fn(async () => ({ status: 'denied' as const }));
    await render(<GetStartedScreen onNext={jest.fn()} onLogIn={jest.fn()} onTerms={jest.fn()} detect={detect} />);
    await waitFor(() => expect(detect).toHaveBeenCalled());
    expect(signup.get().country).toBeNull();
    expect(screen.getByTestId('signup-start-continue')).toBeTruthy();
    expect(screen.getByText('Let’s get started')).toBeTruthy();
  });
});

describe('app permissions (app.json)', () => {
  const expo = require('../app.json').expo;

  it('asks while in use only, at reduced accuracy, with a plain purpose', () => {
    const plugin = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-location');
    expect(plugin[1]).toMatchObject({ isIosBackgroundLocationEnabled: false, isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false });
    expect(plugin[1].locationWhenInUsePermission).toMatch(/Only your country is kept/);
    expect(expo.ios.infoPlist.NSLocationDefaultAccuracyReduced).toBe(true);
    expect(expo.android.blockedPermissions).toEqual(expect.arrayContaining(['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION']));
  });
});
