import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], 'no-console': 'error' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable' } },
  },
  { ignores: ['node_modules/'] },
];
