import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricUnavailableReason = 'no_hardware' | 'not_enrolled';

export interface BiometricAvailability {
  available: boolean;
  reason?: BiometricUnavailableReason;
}

/** Whether this device can actually use biometric auth right now — hardware
 * present AND the user has already enrolled a fingerprint/face in OS settings. */
export async function checkBiometricAvailabilityAsync(): Promise<BiometricAvailability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    return { available: false, reason: 'no_hardware' };
  }
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) {
    return { available: false, reason: 'not_enrolled' };
  }
  return { available: true };
}

/** Prompts Face ID / Touch ID / Android BiometricPrompt. Resolves `true` only
 * on a genuine success — cancellation, lockout, and every error path resolve
 * `false` rather than throwing, since "user declined" isn't exceptional. */
export async function authenticateWithBiometricsAsync(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: false,
  });
  return result.success;
}
