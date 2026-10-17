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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
