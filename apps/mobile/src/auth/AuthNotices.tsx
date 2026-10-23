import { APP_NAME } from '../config';
import { InlineMessage, OfflineLine } from '../ui/Inline';
import type { AuthNotice } from './useAuthCall';

/**
 * Prototype v11: problems with the email show in the email field's error line, the fix as an orange link
 * ("This email already has an account. Sign in instead"). Invite-only uses the same line (ASSUMED: v11 has no
 * invite state).
 */
export function emailProblem(
  notice: AuthNotice,
  h: { onSignIn?: () => void; onSignUp?: () => void },
): { text: string; link?: { label: string; onPress: () => void } } | null {
  switch (notice?.kind) {
    case 'taken':
      return {
        text: 'This email already has an account.',
        ...(h.onSignIn ? { link: { label: 'Sign in instead', onPress: h.onSignIn } } : {}),
      };
    case 'none':
      return {
        text: 'Nobody has signed up with this email.',
        ...(h.onSignUp ? { link: { label: 'Make an account', onPress: h.onSignUp } } : {}),
      };
    case 'invite':
      return { text: `${APP_NAME} is invite-only for now. Ask for an invite with this email.` };
    default:
      return null;
  }
}

/** Page-level auth problems: offline (pill + one line), too many tries, server unreachable (with Try again). */
export function AuthNotices({
  notice,
  offlineVerb,
  onRetry,
}: {
  notice: AuthNotice;
  offlineVerb: string;
  onRetry?: () => void;
}) {
  switch (notice?.kind) {
    case 'offline':
      return <OfflineLine pending={0} text={`Connect to ${offlineVerb}.`} />;
    case 'slow':
      return (
        <InlineMessage parts={[{ hot: 'Too many tries.' }, ' Wait a minute and try again.']} />
      );
    case 'server':
      return (
        <InlineMessage
          parts={[
            `${APP_NAME} couldn’t reach the server. `,
            ...(onRetry ? [{ link: 'Try again', onPress: onRetry }] : []),
          ]}
        />
      );
    default:
      return null;
  }
}
