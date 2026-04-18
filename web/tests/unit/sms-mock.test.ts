import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockSmsClient } from '@/lib/clients/sms/mock';

describe('MockSmsClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('logs the code to stdout', async () => {
    const client = new MockSmsClient();
    await client.sendCode('13800138000', '123456', 'login');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[MOCK SMS]')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('13800138000')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('123456')
    );
  });
});

describe('SMS factory', () => {
  it('returns mock when MOCK_SMS=true', async () => {
    process.env.MOCK_SMS = 'true';
    const mod = await import('@/lib/clients/sms');
    mod._resetSmsClient();
    const client = mod.getSmsClient();
    expect(client.constructor.name).toBe('MockSmsClient');
  });
});
