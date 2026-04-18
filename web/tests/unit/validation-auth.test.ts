import { describe, it, expect } from 'vitest';
import { sendCodeSchema, loginSchema } from '@/lib/validation/auth';

describe('sendCodeSchema', () => {
  it('accepts valid phone', () => {
    expect(sendCodeSchema.safeParse({ phone: '13800138000' }).success).toBe(true);
  });
  it('rejects invalid phone', () => {
    expect(sendCodeSchema.safeParse({ phone: '12300000000' }).success).toBe(false);
    expect(sendCodeSchema.safeParse({ phone: '1380013800' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid phone + 6-digit code', () => {
    expect(loginSchema.safeParse({ phone: '13800138000', code: '123456' }).success).toBe(true);
  });
  it('rejects non-6-digit code', () => {
    expect(loginSchema.safeParse({ phone: '13800138000', code: '12345' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '13800138000', code: 'abcdef' }).success).toBe(false);
  });
});
