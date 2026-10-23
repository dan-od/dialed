import { emailProblem } from '../auth/AuthNotices';

// v11 field problems: the email field's error line, the fix as an orange link; the address isn't repeated.
describe('email field problems', () => {
  const h = { onSignIn: jest.fn(), onSignUp: jest.fn() };
  it('taken → "This email already has an account." + Sign in instead', () => {
    expect(emailProblem({ kind: 'taken' }, h)).toEqual({
      text: 'This email already has an account.',
      link: { label: 'Sign in instead', onPress: h.onSignIn },
    });
  });
  it('none → "Nobody has signed up with this email." + Make an account', () => {
    expect(emailProblem({ kind: 'none' }, h)).toEqual({
      text: 'Nobody has signed up with this email.',
      link: { label: 'Make an account', onPress: h.onSignUp },
    });
  });
  it('invite-only is about the email too (ASSUMED mapping, v11 has no invite state)', () => {
    expect(emailProblem({ kind: 'invite' }, h)?.text).toBe(
      'Dialed is invite-only for now. Ask for an invite with this email.',
    );
  });
  it('page-level problems are not field problems', () => {
    expect(emailProblem({ kind: 'offline' }, h)).toBeNull();
    expect(emailProblem(null, h)).toBeNull();
  });
});
