import { hash, verify } from '@node-rs/argon2';

/** argon2id, m=64 MiB, t=3, p=1 (SECURITY.md). Algorithm 2 = Argon2id. */
export const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

const COMMON = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'qwerty123',
  'iloveyou',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'welcome1',
  'abc12345',
  'letmein1',
  'trustno1',
  'admin123',
  'passw0rd',
  '11111111',
  '00000000',
  'dialed123',
  'monkey123',
  'dragon12',
  'superman',
]);

export function isCommonPassword(pw: string): boolean {
  return COMMON.has(pw.toLowerCase());
}

export const hashPassword = (pw: string) => hash(pw, ARGON2_OPTIONS);

// A fixed hash so unknown-email logins spend the same time as real ones (no timing enumeration).
let dummy: Promise<string> | null = null;
export async function verifyPassword(stored: string | null, pw: string): Promise<boolean> {
  if (!stored) {
    dummy ??= hashPassword('not-a-real-password-xyz');
    await verify(await dummy, pw).catch(() => false);
    return false;
  }
  return verify(stored, pw).catch(() => false);
}
