import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../AppProvider';
import { uploadTimetable } from '../../../import/api';
import { API_BASE_URL } from '../../../config';
import { useTheme } from '../../../theme/theme';
import { Page } from '../../../ui/Chrome';
import { DialLoader } from '../../../ui/DialLoader';
import { StepList } from '../../../ui/StepList';
import { Button } from '../../../ui/Button';
import { T } from '../../../ui/Text';

const STEPS = [
  'Uploading your file',
  'Reading the timetable',
  'Matching classes',
  'Checking for overlaps',
];

export default function Reading() {
  const { uri, name, mime } = useLocalSearchParams<{ uri: string; name: string; mime: string }>();
  const { accessToken } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !uri) return;
    started.current = true;
    const ctl = new AbortController();
    abortRef.current = ctl;

    (async () => {
      setStep(0);
      const token = accessToken();
      if (!token) {
        setError('You were signed out.');
        return;
      }
      try {
        setStep(1);
        const plan = await uploadTimetable(API_BASE_URL, token, uri, name, mime);
        setStep(3);
        router.replace({ pathname: '/plan/[id]', params: { id: plan.id } });
      } catch (e: unknown) {
        if (ctl.signal.aborted) return;
        const err = e as { code?: string; message?: string };
        if (err.code === 'file_unsupported') {
          setError("That file type isn't supported. Try a photo, PDF or Word document.");
        } else if (err.code === 'file_too_large') {
          setError('That file is too large. The limit is 15 MB.');
        } else if (err.code === 'vision_unavailable') {
          setError("Image reading isn't available right now. Try a PDF or Word document instead.");
        } else if (err.code === 'daily_limit') {
          setError("You've reached today's import limit. Try again tomorrow.");
        } else {
          setError(err.message ?? 'Something went wrong. Try again.');
        }
      }
    })();

    return () => {
      ctl.abort();
    };
  }, [uri, name, mime, accessToken, router]);

  const cancel = () => {
    abortRef.current?.abort();
    router.back();
  };

  if (error) {
    return (
      <Page>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 20,
            gap: 16,
          }}
        >
          <T size={20} weight="700" style={{ textAlign: 'center' }}>
            {"Can't read that"}
          </T>
          <T size={15} weight="500" color={c.muted} style={{ textAlign: 'center', maxWidth: 280 }}>
            {error}
          </T>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}>
          <Button kind="primary" label="Try another file" onPress={() => router.back()} />
          <Button kind="secondary" label="Cancel" onPress={cancel} />
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
          gap: 24,
        }}
      >
        <DialLoader color={c.acc} />
        <T size={20} weight="700" style={{ textAlign: 'center' }}>
          Reading your timetable
        </T>
        <StepList steps={STEPS} active={step} />
        <T size={14} weight="500" color={c.muted} style={{ textAlign: 'center', maxWidth: 280 }}>
          You can leave this screen. You'll get a notification when it's ready.
        </T>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Button kind="secondary" label="Cancel" onPress={cancel} />
      </View>
    </Page>
  );
}
