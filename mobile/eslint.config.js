// Flat config. `eslint-config-expo` carries the React Native, hooks and import rules
// that match the Expo toolchain; anything beyond that is left to TypeScript strict.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'coverage/**'],
  },
  {
    // The Jest setup file runs in the test environment, not the app bundle.
    files: ['jest.setup.js'],
    languageOptions: { globals: { jest: 'readonly' } },
  },
];
