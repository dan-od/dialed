import { termFor } from '@dialed/schedule';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { categoryWeek, hoursLabel } from '../../settings/model';
import { SetCap, SetGroup, SetRow, Swatch } from '../../settings/ui';
import { BackLink, H1, Header, Page, Sub } from '../../ui/Chrome';
import { PlusIcon } from '../../ui/icons';
import { T } from '../../ui/Text';
import { ToastAwareScroll } from '../../ui/ToastAwareScroll';
import { useSchedule } from '../../week/useSchedule';

/** Categories (Flow 09, prototype `categories`): grouped like the picker, with this week's hours each. */
export default function CategoriesScreen() {
  const { c, isLight, data, now } = useSchedule();
  const router = useRouter();
  const cats = useMemo(
    () =>
      (data?.schedule.categories ?? [])
        .filter((x) => !x.deleted_at)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    [data],
  );
  const week = useMemo(
    () => (data ? categoryWeek(data.schedule, now.date) : new Map()),
    [data, now.date],
  );
  const term = data ? termFor(now.date, data.schedule.terms) : null;
  const routine = term && data?.schedule.routines.find((r) => r.term_id === term.id);
  const groups = [...new Set(cats.map((x) => x.group_name))];

  return (
    <Page>
      <Header left={<BackLink label="Settings" onPress={() => router.back()} />} />
      <ToastAwareScroll base={110} contentContainerStyle={{ paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <H1 size={60}>Categories</H1>
          <Sub>
            {routine
              ? `Colours show in every view. Hours are per week in ${routine.name}.`
              : 'Colours show in every view.'}
          </Sub>
        </View>
        {groups.map((g) => {
          const rows = cats.filter((x) => x.group_name === g);
          return (
            <View key={g}>
              <SetCap>{g}</SetCap>
              <SetGroup>
                {rows.map((x, i) => {
                  const h = hoursLabel(week.get(x.id)?.hours ?? 0);
                  return (
                    <SetRow
                      key={x.id}
                      testID={`cat-${x.name}`}
                      left={<Swatch color={isLight ? x.color_light : x.color_dark} />}
                      label={x.name}
                      value={h}
                      chevron
                      last={i === rows.length - 1}
                      a11yLabel={`${x.name}, ${h.replace('h', '')} hours a week`}
                      onPress={() =>
                        router.push({ pathname: '/category-edit', params: { id: x.id } })
                      }
                    />
                  );
                })}
              </SetGroup>
            </View>
          );
        })}
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Pressable
            testID="cat-new"
            accessibilityRole="button"
            accessibilityLabel="New category"
            onPress={() => router.push({ pathname: '/category', params: { for: 'create' } })}
            style={({ pressed }) => ({
              height: 50,
              borderRadius: 16,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: c.acc2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <PlusIcon color={c.acc2} />
            <T size={15} weight="700" color={c.acc2}>
              New category
            </T>
          </Pressable>
        </View>
      </ToastAwareScroll>
    </Page>
  );
}
