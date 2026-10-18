/**
 * DEMO MODE (ADR-013, hardened by ADR-018). There is no backend, identity provider, SMS or
 * email service yet, so sign-up and log-in run against one demo account and simulated checks.
 * Every simulated step says so on screen.
 *
 * DEMO_MODE is derived from the build, never hand-set: it is on only in development builds
 * (`__DEV__`, which includes Expo Go). In a release build it is false, and then:
 *   - the root layout shows "not available in this build" instead of the app;
 *   - log-in, biometric log-in and sign-up refuse (session.ts);
 *   - trades never advance on their own (tradeStore.ts);
 *   - demo banners, demo fill and on-screen codes disappear.
 * Connecting the real services replaces these demo paths; it must not re-enable them.
 */

declare const __DEV__: boolean | undefined;

/** Pure rule, exported for tests: demo behaviour exists only in a development build. */
export function isDemoBuild(dev: boolean | undefined): boolean {
  return dev === true;
}

export const DEMO_MODE: boolean = isDemoBuild(typeof __DEV__ === 'undefined' ? undefined : __DEV__);

/** The demo person (same as the rest of the mock app). Not a real person or credential. */
export const DEMO_ACCOUNT = {
  phone: '+2348038383838',
  email: 'davidpeters@example.com',
  pin: '482613',
} as const;

/** What a NIN lookup would return for the demo phone (mock identity record). */
export const DEMO_NIN_RECORD = {
  firstName: 'David',
  lastName: 'Peters',
  dateOfBirth: '1997-07-12',
  gender: 'Male',
} as const;
