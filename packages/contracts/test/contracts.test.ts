import { describe, expect, it } from 'vitest';
import { Mutation, PushBody, SignupBody, VerifyBody } from '../src';

describe('auth contracts', () => {
  it('normalises email and rejects unknown fields', () => {
    expect(
      SignupBody.parse({ name: ' Owner ', email: ' Owner@Dialed.Test ', password: '12345678' }),
    ).toEqual({
      name: 'Owner',
      email: 'owner@dialed.test',
      password: '12345678',
    });
    expect(
      SignupBody.safeParse({ name: 'a', email: 'a@b.co', password: '12345678', admin: true })
        .success,
    ).toBe(false);
    expect(SignupBody.safeParse({ name: 'a', email: 'a@b.co', password: 'short' }).success).toBe(
      false,
    );
  });
  it('code strips spaces and dashes', () => {
    expect(VerifyBody.parse({ email: 'a@b.co', code: '123-456' }).code).toBe('123456');
    expect(VerifyBody.safeParse({ email: 'a@b.co', code: '12345' }).success).toBe(false);
  });
});

describe('sync contracts', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('times must sit on a 5-minute grid', () => {
    const m = {
      client_mutation_id: id,
      entity: 'override',
      op: 'upsert',
      id,
      base_version: 0,
      fields: {
        on_date: '2026-10-20',
        kind: 'add',
        title: 'X',
        start_min: 601,
        end_min: 660,
        category_id: id,
      },
    };
    expect(Mutation.safeParse(m).success).toBe(false);
    expect(Mutation.safeParse({ ...m, fields: { ...m.fields, start_min: 600 } }).success).toBe(
      true,
    );
  });
  it('max 100 mutations', () => {
    const m = {
      client_mutation_id: id,
      entity: 'profile',
      op: 'upsert',
      base_version: 1,
      fields: { theme: 'dark' },
    };
    expect(PushBody.safeParse({ mutations: Array(101).fill(m) }).success).toBe(false);
  });
});
