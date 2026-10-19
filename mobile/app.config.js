/**
 * Adds build-time settings to app.json (ADR-052).
 *
 * GOOGLE_SERVICES_JSON is a secret *file* environment variable in Expo (EAS): during a cloud
 * build it holds the path of the Firebase google-services.json, which Android push needs.
 * The file is never committed. Without it (Expo Go, local runs) push is simply off on Android.
 */
module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-notifications', { defaultChannel: 'default' }],
    ],
  };
};
