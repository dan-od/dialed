import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { LARGE_TEXT } from '../../ui/largeText';
import { useApp } from '../../AppProvider';
import { aiName } from '../../config';
import { termDateError, termNotices, termStatus, type TermStatus } from '../../routines/model';
import { useTheme } from '../../theme/theme';
import { BackLink, H1, Header, Sub } from '../../ui/Chrome';
import { InlineMessage } from '../../ui/Inline';
import { DateField } from '../../blocks/ui';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { ToastAwareScroll } from '../../ui/ToastAwareScroll';
import { useSchedule } from '../../week/useSchedule';
import { shortDate } from '../../routines/model';

/** Terms and dates (Flow 05, prototype `terms`): per-term dates saved inline, gap/overlap notices, rules. */
export default function TermsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { blocks } = useApp();
  const { data, now } = useSchedule();
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Dates being picked, saved once when the wheel closes.
  const [drafts, setDrafts] = useState<Record<string, { starts_on?: string; ends_on?: string }>>(
    {},
  );
  // Large Dynamic Type: the native date fields stack so they don't overflow.
  const large = useWindowDimensions().fontScale >= LARGE_TEXT;
  const terms = (data?.schedule.terms ?? [])
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const notices = termNotices(terms);

  // Tags ≥ 4.5:1: Active/Next use onStatus (cream in light), Draft/Past text on surf2 (owner review 2026-10-22).
  const tag = (s: TermStatus) =>
    s === 'Active'
      ? { bg: c.ok, fg: c.onStatus }
      : s === 'Next'
        ? { bg: c.warn, fg: c.onStatus }
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
      setDrafts((x) => {
        const { [id]: _done, ...rest } = x;
        void _done;
        return rest;
      });
      toast('Saved. Days in the new range fill in from the routine.');
    } catch {
      toast('Those dates couldn’t be saved on this phone. Try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header left={<BackLink label="Routines" onPress={() => router.back()} />} />
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
                    flexDirection: large ? 'column' : 'row',
                    gap: 8,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                  }}
                >
                  {(['starts_on', 'ends_on'] as const).map((k) => {
                    const d = { ...t, ...(drafts[t.id] ?? {}) };
                    return (
                      <View key={k} style={{ flex: large ? undefined : 1 }}>
                        <DateField
                          label={k === 'starts_on' ? 'Starts' : 'Ends'}
                          testID={`${t.name}-${k}`}
                          value={d[k]}
                          bad={!!errors[t.id] && k === 'ends_on'}
                          onChange={(v) =>
                            setDrafts((x) => ({ ...x, [t.id]: { ...(x[t.id] ?? {}), [k]: v } }))
                          }
                          onClose={() => {
                            if (d.starts_on === t.starts_on && d.ends_on === t.ends_on) return;
                            void change(t.id, d.starts_on, d.ends_on);
                          }}
                        />
                      </View>
                    );
                  })}
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
                    <InlineMessage
                      inSheet
                      parts={[
                        { hot: overlap.text.slice(0, overlap.text.indexOf('. ') + 1) },
                        overlap.text.slice(overlap.text.indexOf('. ') + 1),
                      ]}
                    />
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
                <InlineMessage
                  parts={[
                    { b: gap.text.slice(0, gap.text.indexOf(' has no term')) },
                    gap.text.slice(gap.text.indexOf(' has no term')),
                  ]}
                />
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
