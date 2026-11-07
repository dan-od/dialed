import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { termFor } from '@dialed/schedule';
import { useApp } from '../../../AppProvider';
import {
  requestCalendarAccess,
  loadCalendars,
  readEvents,
  previewStamp,
  type DeviceCalendar,
} from '../../../import/calendarImport';
import { importCalendar } from '../../../import/api';
import { useTheme } from '../../../theme/theme';
import { BackLink, Header, Page } from '../../../ui/Chrome';
import { Button } from '../../../ui/Button';
import { PinnedFooter } from '../../../ui/PinnedFooter';
import { Spinner } from '../../../ui/Spinner';
import { Stamp } from '../../../ui/Stamp';
import { T } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';

export default function Calendars() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { api, data, syncNow } = useApp();

  const schedule = data?.schedule;
  const term = schedule
    ? termFor(new Date().toISOString().slice(0, 10), schedule.terms ?? [])
    : null;
  const termStart = term?.starts_on ?? new Date().toISOString().slice(0, 10);
  const termEnd =
    term?.ends_on ??
    (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 4);
      return d.toISOString().slice(0, 10);
    })();
  const termName = term?.name ?? 'term';

  const [cals, setCals] = useState<DeviceCalendar[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const access = await requestCalendarAccess();
      if (access === 'denied') {
        setDenied(true);
        setLoading(false);
        return;
      }
      const list = await loadCalendars(termStart, termEnd);
      setCals(list);
      setLoading(false);
    })();
  }, [termStart, termEnd]);

  const toggle = useCallback((id: string, value: boolean) => {
    setCals((prev) => prev?.map((c) => (c.id === id ? { ...c, checked: value } : c)) ?? null);
  }, []);

  const selected = cals?.filter((c) => c.checked) ?? [];
  const selectedIds = selected.map((c) => c.id);

  const doImport = async () => {
    if (selectedIds.length === 0 || busy) return;
    setBusy(true);
    try {
      const events = await readEvents(selectedIds, termStart, termEnd);
      if (events.length === 0) {
        toast('No events found in those calendars for this term.');
        setBusy(false);
        return;
      }
      const plan = await importCalendar(api, events);
      syncNow();
      router.replace({ pathname: '/plan/[id]', params: { id: plan.id } });
    } catch {
      toast("Couldn't import. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const repeating = selected.reduce((n, c) => n + c.repeating, 0);
  const oneOff = selected.reduce((n, c) => n + c.oneOff, 0);
  const totalEvents = repeating + oneOff;

  if (denied) {
    return (
      <Page>
        <Header left={<BackLink label="Back" onPress={() => router.back()} />} />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 20,
            gap: 12,
          }}
        >
          <T size={20} weight="700" style={{ textAlign: 'center' }}>
            No calendar access
          </T>
          <T size={15} weight="500" color={c.muted} style={{ textAlign: 'center', maxWidth: 280 }}>
            You can still add your timetable or describe your week.
          </T>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <Button kind="secondary" label="Go back" onPress={() => router.back()} />
        </View>
      </Page>
    );
  }

  if (loading) {
    return (
      <Page>
        <Header left={<BackLink label="Back" onPress={() => router.back()} />} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner color={c.muted} size={24} />
        </View>
      </Page>
    );
  }

  return (
    <Page>
      <Header left={<BackLink label="Back" onPress={() => router.back()} />} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 }}
      >
        <T size={28} weight="700">
          Pick calendars
        </T>
        <T size={14} weight="500" color={c.muted} style={{ marginTop: 4 }}>
          Only the ones with your classes, work and projects. Birthdays and holidays stay out.
        </T>

        <View style={{ marginTop: 16, gap: 1 }}>
          {(cals ?? []).map((cal) => (
            <Pressable
              key={cal.id}
              accessibilityRole="switch"
              accessibilityLabel={`${cal.title}, ${cal.eventCount} events`}
              onPress={() => toggle(cal.id, !cal.checked)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}
            >
              <View
                style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: cal.color }}
              />
              <View style={{ flex: 1 }}>
                <T size={15} weight="600">
                  {cal.title}
                </T>
                <T size={12} weight="500" color={c.muted}>
                  {cal.eventCount} event{cal.eventCount === 1 ? '' : 's'}
                  {cal.source ? ` · ${cal.source}` : ''}
                </T>
              </View>
              <Switch
                value={cal.checked}
                onValueChange={(v) => toggle(cal.id, v)}
                trackColor={{ false: c.surf2, true: c.acc }}
              />
            </Pressable>
          ))}
        </View>

        {selectedIds.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <Stamp text={previewStamp(repeating, oneOff, termName)} kind="info" />
          </View>
        ) : null}
      </ScrollView>

      <PinnedFooter>
        <Button
          kind="primary"
          label={selectedIds.length > 0 ? `Import ${totalEvents} events` : 'Pick a calendar'}
          disabled={selectedIds.length === 0 || busy}
          busy={busy}
          onPress={() => void doImport()}
        />
      </PinnedFooter>
    </Page>
  );
}
