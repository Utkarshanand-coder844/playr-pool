// eslint.config.js — ESLint v9 flat config
// Covers the server (Node ES modules) and client (React 18 + Vite)
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';

export default [
  // ─── Global ignores ───────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'server/node_modules/**',
      'client/node_modules/**',
      'client/dist/**',
      'dist/**',
      'build/**',
      '**/*.min.js',
    ],
  },

  // ─── Server (Node ES modules) ─────────────────────────────────────────────
  {
    files: ['server/**/*.js', '*.js', 'test-*.js', 'scripts/**/*.js'],
    ...js.configs.recommended,
    plugins: { import: importPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Promise: 'readonly',
        Error: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        Object: 'readonly',
        Array: 'readonly',
        RegExp: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Symbol: 'readonly',
        BigInt: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'object-shorthand': 'warn',
    },
  },
];
