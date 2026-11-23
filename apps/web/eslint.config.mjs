import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'next-env.d.ts', 'vitest.config.ts'] },
  {
    // Loading-flag-in-effect is the data-fetching pattern used across the shared hooks and the mobile app
    // (same rule is already off in packages/hooks). TODO: move fetching to a query library, then re-enable.
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
];

export default config;
