import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(8).max(128);

export const SignupBody = z.strictObject({
  name: z.string().trim().min(1).max(80),
  email,
  password,
});
export const VerifyBody = z.strictObject({
  email,
  code: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().length(6)),
  time_zone: z.string().max(64).optional(),
});
export const ResendBody = z.strictObject({ email, purpose: z.enum(['verify', 'reset']) });
export const LoginBody = z.strictObject({
  email,
  password: z.string().min(1).max(128),
  time_zone: z.string().max(64).optional(),
});
export const LoginCheckBody = z.strictObject({ email });
export const ForgotBody = z.strictObject({ email });
export const ResetBody = z.strictObject({ token: z.string().min(20).max(200), password });
export const RefreshBody = z.strictObject({ refresh_token: z.string().min(20).max(200) });

export const UserOut = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  display_name: z.string(),
  time_zone: z.string(),
});
export const TokensOut = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  user: UserOut,
  is_new: z.boolean(),
});
export type TokensOut = z.infer<typeof TokensOut>;
export type UserOut = z.infer<typeof UserOut>;
