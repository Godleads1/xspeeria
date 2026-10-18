/**
 * Screens apply the safe-area inset themselves, so components under test call
 * `useSafeAreaInsets`. Tests render them without the provider that expo-router mounts at
 * runtime; this is the library's own mock, not a hand-rolled stand-in.
 */
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

/** Native modules with no JS fallback in Jest: record calls, do nothing. */
jest.mock('expo-screen-capture', () => ({
  allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  usePreventScreenCapture: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)), getStringAsync: jest.fn(() => Promise.resolve('')) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// Location: declined by default; tests that need a country pass their own `detect`.
jest.mock('expo-location', () => ({
  Accuracy: { Lowest: 1 },
  getForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getCurrentPositionAsync: jest.fn(() => Promise.reject(new Error('not in tests'))),
  reverseGeocodeAsync: jest.fn(() => Promise.resolve([])),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
}));
