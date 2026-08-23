// Flat config on ESLint 9.
//
// The whole workspace shares one ESLint major: mobile needs 9 for
// `eslint-config-expo/flat`, and two majors across workspaces breaks hoisted plugin
// resolution. `next lint` is tied to the eslintrc era, so the Next rules are loaded
// from the plugin directly, which is what Next's own flat config does.
import nextPlugin from '@next/eslint-plugin-next';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];
