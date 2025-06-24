import base, { createConfig } from '@metamask/eslint-config';
import jest from '@metamask/eslint-config-jest';
import nodejs from '@metamask/eslint-config-nodejs';
import typescript from '@metamask/eslint-config-typescript';

const config = createConfig([
  {
    ignores: ['dist/', 'docs/', '.yarn/'],
  },

  {
    extends: base,
  },

  {
    files: ['**/*.ts'],
    extends: [typescript, nodejs],
    rules: {
      'node/shebang': 'off',
    },
    languageOptions: {
      parserOptions: {
        // `import.meta.dirname` is supported in Node.js 20.11.0+
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        tsconfigRootDir: import.meta.dirname,
        project: ['./tsconfig.json'],
      },
    },
  },

  {
    files: ['**/*.js'],
    extends: nodejs,
    languageOptions: {
      sourceType: 'script',
    },
  },

  {
    files: ['**/*.mjs'],
    extends: nodejs,
    languageOptions: {
      sourceType: 'module',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.js'],
    extends: [jest, nodejs],
  },
]);

export default config;
