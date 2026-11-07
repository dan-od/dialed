import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Paths } from 'expo-file-system';
import { termFor } from '@dialed/schedule';
import { useApp } from '../../../AppProvider';
import { isUploadableUri, uploadTimetable } from '../../../import/api';
import {
  CANT_READ,
  readFailure,
  readingSteps,
  readingWhat,
  type ReadFailure,
} from '../../../import/foundClasses';
import { openSettings, type TimetableSource } from '../../../import/pickTimetable';
import { useTimetableStart } from '../../../import/useTimetableStart';
import { API_BASE_URL } from '../../../config';
import { haptic } from '../../../lib/haptics';
import { useTheme } from '../../../theme/theme';
import { BackLink, H1, Header, Page, Sub } from '../../../ui/Chrome';
import { DialLoader } from '../../../ui/DialLoader';
import { PinnedFooter } from '../../../ui/PinnedFooter';
import { StepList } from '../../../ui/StepList';
import { Stamp } from '../../../ui/Stamp';
import { Button } from '../../../ui/Button';
import { T } from '../../../ui/Text';

const STEP_MS = 400;

export default function Reading() {
  const { uri, name, mime, source } = useLocalSearchParams<{
    uri: string;
    name: string;
    mime: string;
    source?: TimetableSource;
  }>();
  const { accessToken, data } = useApp();
  const { c } = useTheme();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [failure, setFailure] = useState<ReadFailure | null>(null);
  const [cameraOff, setCameraOff] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const started = useRef(false);
  const start = useTimetableStart(() => setCameraOff(true));

  const term = data?.schedule
    ? termFor(new Date().toISOString().slice(0, 10), data.schedule.terms ?? [])
    : null;
  const steps = readingSteps(
    readingWhat(mime ?? '', name ?? '', source === 'camera'),
    term?.name ?? 'your term',
  );

  useEffect(() => {
    if (started.current || !uri) return;
    started.current = true;
    const ctl = new AbortController();
    abortRef.current = ctl;
    const timers = [
      setTimeout(() => setStep(1), STEP_MS),
      setTimeout(() => setStep(2), STEP_MS * 2),
    ];

    (async () => {
      const token = accessToken();
      if (!token) {
        setFailure({ kind: 'other', message: 'You were signed out.' });
        return;
      }
      if (!isUploadableUri(uri, [Paths.cache.uri, Paths.document.uri])) {
        setFailure({ kind: 'cant_read' });
        return;
      }
      try {
        const plan = await uploadTimetable(API_BASE_URL, token, uri, name, mime, ctl.signal);
        if (ctl.signal.aborted) return;
        setStep(3);
        const toFound =
          plan.status === 'ready' ||
          (plan.status === 'failed' && plan.error_code === 'nothing_found');
        if (toFound) {
          haptic.success();
          router.replace({
            pathname: '/import/found',
            params: { id: plan.id, source: source ?? 'files', name },
          });
        } else {
          // Provider errors use the Flow 06 error pattern.
          router.replace({ pathname: '/plan/[id]', params: { id: plan.id } });
        }
      } catch (e: unknown) {
        if (ctl.signal.aborted) return;
        haptic.warning();
        setFailure(readFailure(e as { code?: string; message?: string }));
      }
    })();

    return () => {
      timers.forEach(clearTimeout);
      ctl.abort();
    };
  }, [uri, name, mime, source, accessToken, router]);

  useEffect(() => {
    if (!failure)
      AccessibilityInfo.announceForAccessibility(steps[Math.min(step, steps.length - 1)]!);
  }, [step, failure, steps]);

  const cancel = () => {
    abortRef.current?.abort();
    router.back();
  };

  if (failure) {
    const heading =
      failure.kind === 'cant_read'
        ? "Can't read that"
        : failure.kind === 'limit'
          ? 'Limit'
          : failure.kind === 'vision'
            ? "Can't read photos"
            : 'Something went wrong';
    const sentence =
      failure.kind === 'cant_read'
        ? CANT_READ
        : failure.kind === 'limit'
          ? failure.message
          : failure.kind === 'vision'
            ? 'Reading photos isn’t available right now. Try a PDF or Word document instead.'
            : failure.message;
    return (
      <Page>
        <Header left={<BackLink label="Set up" onPress={() => router.back()} />} />
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          <H1 size={56}>{heading}</H1>
          <View style={{ marginTop: 12 }}>
            <Stamp text={sentence} />
          </View>
          {cameraOff ? (
            <View style={{ gap: 8, marginTop: 12 }}>
              <Stamp text="Camera access is off. Turn it on in Settings to take a photo." />
              <Button kind="secondary" label="Open Settings" onPress={openSettings} />
            </View>
          ) : null}
        </View>
        <PinnedFooter>
          {failure.kind === 'limit' ? (
            <>
              <Button
                kind="primary"
                label="Bring your own key"
                onPress={() => router.replace('/ai-assistant')}
              />
              <Button kind="secondary" label="Back" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Button
                kind="primary"
                label="Pick another"
                onPress={() => {
                  setCameraOff(false);
                  void start({ replace: true });
                }}
              />
              <Button kind="secondary" label="Cancel" onPress={() => router.back()} />
            </>
          )}
        </PinnedFooter>
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
        <T size={20} weight="700" style={{ textAlign: 'center' }} accessibilityRole="header">
          Reading your classes
        </T>
        <Sub>{`From ${name || 'your file'}. Takes a few seconds.`}</Sub>
        <StepList steps={steps} active={step} />
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Button kind="secondary" label="Cancel" onPress={cancel} />
      </View>
    </Page>
  );
}
