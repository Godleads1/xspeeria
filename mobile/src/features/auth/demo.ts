/**
 * DEMO MODE (ADR-013). There is no backend, identity provider, SMS or email service yet, so
 * sign-up and log-in run against one demo account and simulated checks. Every simulated
 * step says so on screen. Set DEMO_MODE to false (and connect the real services) before any
 * release: with it false, the demo banner, demo fill and simulated checks disappear.
 */

export const DEMO_MODE = true;

/** The demo person (same as the rest of the mock app). Not a real person or credential. */
export const DEMO_ACCOUNT = {
  phone: '+2348038383838',
  email: 'davidpeters@example.com',
  pin: '4826',
} as const;

/** What a NIN lookup would return for the demo phone (mock identity record). */
export const DEMO_NIN_RECORD = {
  firstName: 'David',
  lastName: 'Peters',
  dateOfBirth: '1997-07-12',
  gender: 'Male',
} as const;
