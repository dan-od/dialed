export interface AuthInput {
  name?: string;
  email: string;
  password: string;
}
export type AuthErrors = Partial<Record<'name' | 'email' | 'password', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** SignupForm.validate / SigninForm.validate — copy verbatim from the prototype (Flow 01 Validation row). */
export function validateAuth(kind: 'signup' | 'signin' | 'forgot', a: AuthInput): AuthErrors {
  const err: AuthErrors = {};
  if (kind === 'signup' && !(a.name ?? '').trim()) err.name = 'Add your name.';
  const email = a.email.trim();
  if (!EMAIL.test(email))
    err.email = email ? 'That email looks incomplete. Check the @ and the dot.' : 'Add your email.';
  if (kind === 'signup' && a.password.length < 8) err.password = 'Use 8 or more characters.';
  if (kind === 'signin' && !a.password) err.password = 'Add your password.';
  return err;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
