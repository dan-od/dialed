import type { z } from 'zod';
import { appError } from './errors';

/** Zod-validate a body/query; field errors go to `details.fields` (plain messages, no input echo). */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.length
      ? issue.path.join('.')
      : issue.code === 'unrecognized_keys'
        ? 'body'
        : 'body';
    fields[key] ??= issue.message;
  }
  throw appError('bad_request', 'Some fields need fixing.', { fields });
}
