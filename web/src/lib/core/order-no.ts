import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';

export function generateOrderNo(): string {
  const now = new Date();
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const buf = randomBytes(4);
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += ALPHABET[buf[i] % ALPHABET.length];
  return `AC${ts}${suffix}`;
}

export function isValidOrderNo(s: string): boolean {
  return /^AC\d{14}[A-Z0-9]{4}$/.test(s);
}
