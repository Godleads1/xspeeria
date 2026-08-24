// Flat config on ESLint 9, matching the major the rest of the workspace uses.
//
// The token package is plain TypeScript with no framework, so it needs only the
// TypeScript parser and ESLint's own recommended rules. `--if-present` used to skip
// this workspace entirely because it had no `lint` script, which meant the one package
// both apps depend on was the one package never linted.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      ...js.configs.recommended.rules,
      // The parser handles the type layer; `no-undef` double-reports TS types as
      // undefined globals, which is noise rather than signal here.
      'no-undef': 'off',
    },
  },
];
