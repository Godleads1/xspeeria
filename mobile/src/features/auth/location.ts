/**
 * Location for KYC region (Figma "Let's get started" + location prompt; ADR-022, ADR-016).
 *
 * Why: the identity rules that apply depend on the country the user is in, and an
 * unexpected country is a fraud signal. What is kept: ONLY the two-letter country code.
 * Coordinates are used once to look up the country and then dropped; they are never stored,
 * logged or sent to Xspeeria.
 *
 * Enterprise rules applied:
 * - Asked while the app is in use only (no background location), at reduced accuracy
 *   (Android coarse only; iOS NSLocationDefaultAccuracyReduced). Precise location is not
 *   needed to find a country.
 * - Never required: if the user says no, or anything fails, the result is `unknown` and the
 *   user carries on. The server decides the region from its own signals (ADR-016); a
 *   device-reported country is a hint, never trusted on its own.
 * - The country lookup uses the phone's built-in geocoder (Apple or Google), which receives
 *   the approximate position. This is stated in the privacy notice (to be reviewed).
 */

import * as Location from 'expo-location';

export type CountryResult =
  | { readonly status: 'found'; readonly country: string }
  | { readonly status: 'denied' }
  | { readonly status: 'unknown' };

/** The pieces of expo-location used here, so tests can supply fakes. */
export interface LocationApi {
  getForegroundPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  getCurrentPositionAsync(options: { accuracy: number }): Promise<{ coords: { latitude: number; longitude: number } }>;
  reverseGeocodeAsync(coords: { latitude: number; longitude: number }): Promise<readonly { isoCountryCode: string | null }[]>;
}

const DEFAULT_API: LocationApi = Location as unknown as LocationApi;

/** Two upper-case letters, or null. Anything else from the geocoder is ignored. */
export function cleanCountryCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/**
 * Finds the country the phone is in. `ask` false never shows the permission prompt (used
 * at log-in, so the prompt appears only where the user expects it).
 */
export async function detectCountry(options: { ask: boolean; api?: LocationApi }): Promise<CountryResult> {
  const api = options.api ?? DEFAULT_API;
  try {
    const current = await api.getForegroundPermissionsAsync();
    let granted = current.granted;
    if (!granted && options.ask) granted = (await api.requestForegroundPermissionsAsync()).granted;
    if (!granted) return { status: 'denied' };
    // Lowest accuracy: city-level is more than enough to tell the country.
    const pos = await api.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Lowest ?? 1 });
    const places = await api.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    // The position goes out of scope here and is not kept anywhere.
    const country = cleanCountryCode(places[0]?.isoCountryCode);
    return country ? { status: 'found', country } : { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
  }
}
