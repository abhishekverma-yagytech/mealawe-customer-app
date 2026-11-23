import { describe, expect, it } from 'vitest';

import { ENDPOINTS } from '../http/endpoints';
import { phoneSchema } from '../auth/schemas';
import { formatINR } from '../utils/currency';
import { round2 } from '../utils/money';

describe('money', () => {
  it('formats whole and fractional rupees', () => {
    expect(formatINR(135)).toBe('₹135');
    expect(formatINR(1234.5)).toBe('₹1,234.50');
    expect(formatINR(100000)).toBe('₹1,00,000');
  });
  it('rounds to paise', () => {
    expect(round2(1.005 * 100) / 100).toBeCloseTo(1, 1);
    expect(round2(10.239)).toBe(10.24);
  });
});

describe('contracts', () => {
  it('keeps core auth endpoints stable', () => {
    expect(ENDPOINTS.auth.verifyOtp).toBe('/authuser/verifyOTP');
    expect(ENDPOINTS.auth.registerPhoneNo).toBe('/authuser/registerPhoneNo');
  });
  it('rejects an invalid phone number', () => {
    expect(phoneSchema.safeParse({ phone: '12' }).success).toBe(false);
  });
});
