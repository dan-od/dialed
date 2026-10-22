import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useApp } from '../../AppProvider';
import { aiName } from '../../config';
import { termDateError, termNotices, termStatus, type TermStatus } from '../../routines/model';
import { useTheme } from '../../theme/theme';
import { BackLink, H1, Header, Sub } from '../../ui/Chrome';
import { Notice } from '../../ui/Notice';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { ToastAwareScroll } from '../../ui/ToastAwareScroll';
import { useSchedule } from '../../week/useSchedule';
import { shortDate } from '../../routines/model';

const asDate = (iso: string) => new Date(`${iso}T12:00:00`);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Terms and dates (Flow 05, prototype `terms`): per-term dates saved inline, gap/overlap notices, rules. */
export default function TermsScreen() {
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { blocks } = useApp();
  const { data, now } = useSchedule();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const terms = (data?.schedule.terms ?? [])
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const notices = termNotices(terms);

  // Tags: Draft/Past use text on surf2 (the prototype's ink on surf2 is 1.2:1 in dark).
  const tag = (s: TermStatus) =>
    s === 'Active'
      ? { bg: c.ok, fg: c.ink }
      : s === 'Next'
        ? { bg: c.warn, fg: c.ink }
        : { bg: c.surf2, fg: c.text };

  const change = async (id: string, starts: string, ends: string) => {
    const err = termDateError(starts, ends);
    if (err) {
      setErrors((e) => ({ ...e, [id]: err }));
      return;
    }
    setErrors((e) => {
      const { [id]: _x, ...rest } = e;
      void _x;
      return rest;
    });
    try {
      await blocks.updateTerm(id, { starts_on: starts, ends_on: ends });
      toast('Saved. Days in the new range fill in from the routine.');
    } catch {
      toast('Those dates couldn’t be saved on this phone. Try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header left={<BackLink label="Back" onPress={() => router.back()} />} />
      <ToastAwareScroll base={60} contentContainerStyle={{ paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={56}>Terms and dates</H1>
          <Sub>
            Each term runs its own routine. Days outside every term stay empty unless you add
            something.
          </Sub>
        </View>
        {terms.map((t) => {
          const status = termStatus(t, now.date);
          const tg = tag(status);
          const overlap = notices.find((n) => n.kind === 'overlap' && n.on === t.name);
          const gap = notices.find((n) => n.kind === 'gap' && n.after === t.name);
          return (
            <View key={t.id}>
              <View
                style={{
                  marginTop: 14,
                  marginHorizontal: 20,
                  borderRadius: 20,
                  backgroundColor: c.surf,
                }}
              >
                <View
                  style={{
                    minHeight: 54,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottomWidth: 1,
                    borderBottomColor: c.surf2,
                  }}
                >
                  <T size={17} weight="800" accessibilityRole="header">
                    {t.name}
                  </T>
                  <View
                    style={{
                      height: 22,
                      paddingHorizontal: 8,
                      borderRadius: 11,
                      backgroundColor: tg.bg,
                      justifyContent: 'center',
                    }}
                  >
                    <T size={11} weight="800" color={tg.fg} style={{ lineHeight: 14 }}>
                      {status}
                    </T>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 8,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                  }}
                >
                  {(['starts_on', 'ends_on'] as const).map((k) => (
                    <View key={k} style={{ flex: 1, gap: 6 }}>
                      <T size={13} weight="700" color={c.muted} accessible={false}>
                        {k === 'starts_on' ? 'Starts' : 'Ends'}
                      </T>
                      <View
                        style={{
                          height: 44,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          borderColor: errors[t.id] && k === 'ends_on' ? c.err : c.line,
                          backgroundColor: c.surf,
                          justifyContent: 'center',
                          alignItems: 'flex-start',
                          paddingHorizontal: 4,
                        }}
                      >
                        <DateTimePicker
                          testID={`${t.name}-${k}`}
                          accessibilityLabel={`${t.name} ${k === 'starts_on' ? 'starts' : 'ends'}, ${shortDate(t[k])}`}
                          mode="date"
                          display="compact"
                          value={asDate(t[k])}
                          themeVariant={isLight ? 'light' : 'dark'}
                          accentColor={c.acc}
                          onValueChange={(_e, d) => {
                            if (!d) return;
                            const v = iso(d);
                            void change(
                              t.id,
                              k === 'starts_on' ? v : t.starts_on,
                              k === 'ends_on' ? v : t.ends_on,
                            );
                          }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
                {errors[t.id] ? (
                  <T
                    size={13}
                    weight="600"
                    color={c.err}
                    style={{ marginHorizontal: 16, marginBottom: 12 }}
                  >
                    {errors[t.id]}
                  </T>
                ) : null}
                {overlap ? (
                  <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                    <Notice inline stamp="Overlap" text={overlap.text} />
                  </View>
                ) : null}
                {t.is_draft ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint="Import a timetable for this term"
                    onPress={() => toast('Timetable import arrives with Flow 02.')}
                    style={{ marginHorizontal: 16, marginBottom: 12 }}
                  >
                    <T size={13} weight="500" color={c.muted} style={{ lineHeight: 18 }}>
                      {`Add your new classes before ${shortDate(t.starts_on)}. A photo, PDF or Word doc of the timetable works.`}
                    </T>
                  </Pressable>
                ) : null}
              </View>
              {gap ? (
                <View style={{ marginHorizontal: 20, marginTop: 12 }}>
                  <Notice inline kind="quiet" stamp="No term" text={gap.text} />
                </View>
              ) : null}
            </View>
          );
        })}

        <T
          size={13}
          weight="700"
          color={c.muted}
          style={{ marginTop: 22, marginHorizontal: 20, letterSpacing: 0.4 }}
        >
          RULES
        </T>
        <View
          style={{ marginTop: 14, marginHorizontal: 20, borderRadius: 20, backgroundColor: c.surf }}
        >
          {[
            {
              label: '“Rest of the year” means',
              small: `Used when you or ${aiName()} say it in a plan.`,
              value: 'Dec 31',
            },
            { label: 'Week starts on', small: null, value: 'Monday' },
          ].map((r, i) => (
            <View
              key={r.label}
              accessible
              accessibilityLabel={`${r.label} ${r.value}`}
              style={{
                minHeight: 54,
                paddingVertical: 10,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderBottomWidth: i === 0 ? 1 : 0,
                borderBottomColor: c.surf2,
              }}
            >
              <View style={{ flex: 1 }}>
                <T size={16} weight="600">
                  {r.label}
                </T>
                {r.small ? (
                  <T size={13} weight="500" color={c.muted} style={{ lineHeight: 17 }}>
                    {r.small}
                  </T>
                ) : null}
              </View>
              <T size={14} weight="600" color={c.muted}>
                {r.value}
              </T>
            </View>
          ))}
        </View>
      </ToastAwareScroll>
    </View>
  );
}
