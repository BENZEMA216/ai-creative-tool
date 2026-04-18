import { randomInt } from 'node:crypto';

const PREFIX = 'AC';
const LENGTH = 8;

export function generateUserId(): string {
  const min = 10 ** (LENGTH - 1);
  const max = 10 ** LENGTH;
  return `${PREFIX}${randomInt(min, max)}`;
}

export function isValidUserId(s: string): boolean {
  return new RegExp(`^${PREFIX}\\d{${LENGTH}}$`).test(s);
}
