// Flat ESLint config for platform-neutral shared packages (core/api/state/hooks).
// These packages must run unchanged on React Native AND the browser, so they
// may not import platform SDKs or touch browser globals directly — use the
// ports in @mealawe/core (registerPlatform / getAdapter) instead.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const restrictedPatterns = [
  { group: ['react-native', 'react-native-*', 'expo', 'expo-*', '@expo/*', '@react-native-*', '@react-native-firebase/*'], message: 'Shared packages must not import native SDKs. Add a port in @mealawe/core.' },
  { group: ['next', 'next/*'], message: 'Shared packages must not import Next.js.' },
  { group: ['@/*'], message: 'Shared packages must not use app-local aliases.' },
];

module.exports = function sharedConfig(extra = []) {
  return defineConfig([
    expoConfig,
    {
      files: ['**/*.{ts,tsx}'],
      ignores: ['**/__tests__/**'],
      rules: {
        'no-restricted-imports': ['error', { patterns: restrictedPatterns }],
        'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator', '__DEV__'],
      },
    },
    ...extra,
  ]);
};
