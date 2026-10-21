import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Peppered SHA-256 (HMAC) for email codes, reset tokens and refresh tokens; only hashes are stored. */
export function pepperedHash(pepperHex: string, value: string): string {
  return createHmac('sha256', Buffer.from(pepperHex, 'hex')).update(value).digest('hex');
}

export function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
