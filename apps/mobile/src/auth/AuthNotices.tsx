import { APP_NAME } from '../config';
import { Notice } from '../ui/Notice';
import type { AuthNotice } from './useAuthCall';

export function AuthNotices({
  notice,
  email,
  offlineVerb,
  onSignIn,
  onSignUp,
  onRetry,
}: {
  notice: AuthNotice;
  email: string;
  offlineVerb: string;
  onSignIn?: () => void;
  onSignUp?: () => void;
  onRetry?: () => void;
}) {
  if (!notice) return null;
  switch (notice.kind) {
    case 'taken':
      return (
        <Notice
          stamp="Already in"
          text={`There’s already an account for ${email}.`}
          action={onSignIn && { label: 'Sign in instead', onPress: onSignIn }}
        />
      );
    case 'invite':
      return (
        <Notice
          stamp="Invite only"
          text={`${APP_NAME} is invite-only for now. Ask for an invite with this email.`}
        />
      );
    case 'none':
      return (
        <Notice
          stamp="No account"
          text={`Nobody has signed up with ${email} yet.`}
          action={onSignUp && { label: 'Make an account', onPress: onSignUp }}
        />
      );
    case 'offline':
      return <Notice stamp="Offline" text={`You’re offline. Connect to ${offlineVerb}.`} />;
    case 'slow':
      return <Notice stamp="Slow down" text="Too many tries. Wait a minute and try again." />;
    case 'server':
      return (
        <Notice
          stamp="Hmm"
          text={`${APP_NAME} couldn’t reach the server. Try again.`}
          action={onRetry && { label: 'Try again', onPress: onRetry }}
        />
      );
  }
}
