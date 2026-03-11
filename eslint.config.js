const { defineConfig } = require('eslint/config');
const amoBase = require('eslint-config-amo/base');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const amoPlugin = require('eslint-plugin-amo');

module.exports = defineConfig([
  ...amoBase,
  ...tsPlugin.configs['flat/recommended'],
  {
    plugins: { amo: amoPlugin },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true },
        node: { extensions: ['.js', '.ts'] },
      },
    },
    rules: {
      ...amoPlugin.configs.typescript.rules,
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/*.spec.*', 'tests/helpers.ts'],
        },
      ],
      'import/extensions': ['error', 'never', { json: 'always' }],
      // This rule conflicts with our convention.
      'jest/valid-describe': 'off',
      // This is not needed for this project.
      'amo/only-tsx-files': 'off',
      // Report an error when a variable is not used.
      '@typescript-eslint/no-unused-vars': 'error',
      // The beauty of TS is that it infers types quite well, so let's not write
      // too much code.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      'import/no-unresolved': ['error', { ignore: ['estree'] }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
        },
      ],
    },
  },
]);
