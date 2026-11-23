module.exports = require('@mealawe/config/eslint.shared')([
  {
    // Pre-existing pattern carried over from the mobile app (same 2 errors in the original repo).
    // TODO: refactor these effects, then remove this override.
    files: ['src/**/*.ts'],
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
]);
