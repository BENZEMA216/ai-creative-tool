import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
});

import { signUserToken, verifyUserToken } from '@/lib/security/jwt';

describe('JWT', () => {
  it('signs and verifies a token', async () => {
    const token = await signUserToken({ uid: 'user-uuid', userId: 'AC10086234' });
    expect(token.split('.').length).toBe(3); // JWT 3 段

    const payload = await verifyUserToken(token);
    expect(payload.uid).toBe('user-uuid');
    expect(payload.userId).toBe('AC10086234');
  });

  it('rejects tampered token', async () => {
    const token = await signUserToken({ uid: 'u', userId: 'AC00000001' });
    const tampered = token.slice(0, -2) + 'xx';
    await expect(verifyUserToken(tampered)).rejects.toThrow();
  });

  it('rejects token signed with different secret', async () => {
    const token = await signUserToken({ uid: 'u', userId: 'AC00000001' });
    process.env.JWT_SECRET = 'different-secret-min-32-chars-abcdefgh';
    await expect(verifyUserToken(token)).rejects.toThrow();
    process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  });
});
