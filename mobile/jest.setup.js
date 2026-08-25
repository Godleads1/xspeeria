/**
 * Screens apply the safe-area inset themselves, so components under test call
 * `useSafeAreaInsets`. Tests render them without the provider that expo-router mounts at
 * runtime; this is the library's own mock, not a hand-rolled stand-in.
 */
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
