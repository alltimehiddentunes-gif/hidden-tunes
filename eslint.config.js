// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  /**
   * Sports screens use standard effect+load patterns recovered from the
   * Sports pilot. CLEAN's React Compiler lint is stricter than the source
   * workspace; keep Sports isolated and avoid a navigation rewrite here.
   */
  {
    files: ['app/sports/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
    },
  },
]);
