import { Redirect } from 'expo-router';
import { useApp } from '../AppProvider';

/** Launch routing (Flow 01 step 1): valid session → Day; otherwise Welcome. */
export default function Index() {
  const { session } = useApp();
  return <Redirect href={session.status === 'signedIn' ? '/day' : '/welcome'} />;
}
