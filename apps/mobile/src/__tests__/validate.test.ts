import { validateAuth } from '../auth/validate';

describe('validateAuth', () => {
  it('signup-invalid copy', () => {
    expect(validateAuth('signup', { name: '', email: 'alex@example', password: 'short' })).toEqual({
      name: 'Add your name.',
      email: 'That email looks incomplete. Check the @ and the dot.',
      password: 'Use 8 or more characters.',
    });
  });
  it('empty email and empty sign-in password', () => {
    expect(validateAuth('signin', { email: '', password: '' })).toEqual({
      email: 'Add your email.',
      password: 'Add your password.',
    });
  });
  it('valid input has no errors; trailing spaces are fine', () => {
    expect(
      validateAuth('signup', { name: 'Alex', email: ' alex@example.com ', password: 'longenough' }),
    ).toEqual({});
  });
});
