export { BiometricGate } from './BiometricGate';
export { useSecurityStore, type SetBiometricLockResult } from './useSecurityStore';
export {
  checkBiometricAvailabilityAsync,
  authenticateWithBiometricsAsync,
  type BiometricAvailability,
  type BiometricUnavailableReason,
} from './biometricAuth';
