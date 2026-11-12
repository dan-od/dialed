import { noticeFor } from '../auth/notice';

describe('noticeFor', () => {
  it('a failed code email gets its own notice, not "couldn’t reach the server"', () => {
    expect(noticeFor('email_send_failed')).toEqual({ kind: 'email' });
  });
  it.each([
    ['offline', 'offline'],
    ['rate_limited', 'slow'],
    ['email_taken', 'taken'],
    ['invite_required', 'invite'],
    ['server_error', 'server'],
  ] as const)('%s → %s', (code, kind) => {
    expect(noticeFor(code).kind).toBe(kind);
  });
});
