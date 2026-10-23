import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActionSheetIOS, Pressable, View } from 'react-native';
import { useApp } from '../../AppProvider';
import { Chip, Label, SheetHeader, SheetScroll } from '../../blocks/ui';
import { FEATURES } from '../../config';
import { haptic } from '../../lib/haptics';
import {
  blocksUseLine,
  categoryWeek,
  deleteLine,
  PALETTE,
  paletteIndex,
  protectedLine,
} from '../../settings/model';
import { SetRow, SetSwitch } from '../../settings/ui';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Chrome';
import { Field } from '../../ui/Field';
import { ChevronIcon } from '../../ui/icons';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { useClock } from '../../clock/clock';

const NONE = '__none';

/**
 * Edit category (Flow 09, prototype `catEdit`): rename, recolour, regroup; Merge and Delete sit below Save so
 * they are never the first tap. The Quiet row is a D-35 screen: shown only with the feature flag.
 */
export default function CategoryEditSheet() {
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, categories } = useApp();
  const now = useClock(data?.profile?.time_zone ?? 'America/Toronto');
  const all = useMemo(
    () =>
      (data?.schedule.categories ?? [])
        .filter((x) => !x.deleted_at)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    [data],
  );
  const cat = all.find((x) => x.id === id);
  const [name, setName] = useState(cat?.name ?? '');
  const [col, setCol] = useState(cat ? paletteIndex(cat.color_dark) : -1);
  const [group, setGroup] = useState(cat?.group_name ?? 'Life');
  const [quiet, setQuiet] = useState(!!cat?.quiet);
  const [error, setError] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const others = all.filter((x) => x.id !== id);
  const [target, setTarget] = useState<string>(others[0]?.id ?? NONE);
  if (!cat || !data) return null;
  const n = categoryWeek(data.schedule, now.date).get(cat.id)?.blocks ?? 0;
  const groups = [...new Set(all.map((x) => x.group_name))];
  const to = others.find((x) => x.id === target) ?? null;

  const save = async () => {
    const r = await categories.save(cat.id, {
      name,
      group,
      colour: col,
      ...(FEATURES.d35Screens ? { quiet } : {}),
    });
    if (!r.ok) {
      haptic.warning();
      setError(r.reason === 'empty' ? 'Give it a name first.' : r.message);
      return;
    }
    haptic.success();
    router.back();
    toast(`Saved ${name.trim().replace(/\s+/g, ' ')}.`);
  };

  const pickTarget = () => {
    const opts = [...others.map((x) => x.name), 'Delete those blocks too', 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Move them to',
        options: opts,
        cancelButtonIndex: opts.length - 1,
        destructiveButtonIndex: opts.length - 2,
      },
      (i) => {
        if (i < others.length) setTarget(others[i]!.id);
        else if (i === others.length) setTarget(NONE);
      },
    );
  };

  const remove = async () => {
    haptic.warning();
    setDel(false);
    await categories.remove(
      cat.id,
      n === 0 ? {} : target === NONE ? { deleteBlocks: true } : { reassignTo: target },
    );
    router.back();
    toast(`Deleted ${cat.name}.`);
  };

  return (
    <SheetScroll>
      <View accessibilityLabel="Edit category" style={{ gap: 14 }}>
        <SheetHeader title="Edit category" size={28} onClose={() => router.back()} />
        <Field
          testID="ce-name"
          label="Name"
          value={name}
          maxLength={40}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          error={error ?? undefined}
        />
        <View style={{ gap: 6 }}>
          <Label>Colour</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {PALETTE.map((p, i) => (
              <Pressable
                key={p.name}
                testID={`pal-${i}`}
                accessibilityRole="radio"
                accessibilityLabel={p.name}
                accessibilityState={{ selected: col === i }}
                hitSlop={2}
                onPress={() => {
                  haptic.selection();
                  setCol(i);
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 3,
                  borderColor: col === i ? c.text : 'transparent',
                  backgroundColor: isLight ? p.light : p.dark,
                }}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Label>Group</Label>
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          >
            {groups.map((g) => (
              <Chip key={g} label={g} on={group === g} onPress={() => setGroup(g)} />
            ))}
          </View>
        </View>
        {FEATURES.d35Screens ? (
          <View style={{ marginHorizontal: -16 }}>
            <SetRow
              label="Quiet"
              small={
                quiet
                  ? 'No Live Activity or reminders. Shows in the line under the date, like meals and breaks.'
                  : 'Gets a Live Activity during its blocks, like classes and projects.'
              }
              last
              right={
                <SetSwitch testID="ce-quiet" label="Quiet" value={quiet} onChange={setQuiet} />
              }
            />
          </View>
        ) : null}
        <T size={13} weight="500" color={c.muted}>
          {blocksUseLine(n)}
        </T>
        <Button testID="ce-save" label="Save" onPress={() => void save()} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            testID="ce-merge"
            kind="secondary"
            label="Merge into…"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/category-merge', params: { id: cat.id } })}
          />
          <Button
            testID="ce-del"
            kind="secondary"
            label="Delete"
            fg={c.err}
            style={{ flex: 1 }}
            onPress={() => setDel(true)}
          />
        </View>
      </View>
      <Dialog visible={del} title={`Delete ${cat.name}?`} body={deleteLine(n)}>
        {n > 0 ? (
          <Pressable
            testID="cd-to"
            accessibilityRole="button"
            accessibilityLabel="Move them to"
            accessibilityValue={{ text: to?.name ?? 'Delete those blocks too' }}
            onPress={pickTarget}
            style={{
              height: 46,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: c.line,
              backgroundColor: c.surf,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <T size={15} weight="600" style={{ flex: 1 }} numberOfLines={1}>
              {to?.name ?? 'Delete those blocks too'}
            </T>
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <ChevronIcon color={c.muted} />
            </View>
          </Pressable>
        ) : null}
        {n > 0 && protectedLine(cat, to) ? (
          <T size={13} weight="500" color={c.muted} style={{ lineHeight: 18 }}>
            {protectedLine(cat, to)}
          </T>
        ) : null}
        <Button
          testID="cd-keep"
          kind="secondary"
          label="Cancel"
          style={{ marginTop: 6 }}
          onPress={() => setDel(false)}
        />
        <Button testID="cd-go" kind="destructive" label="Delete" onPress={() => void remove()} />
      </Dialog>
    </SheetScroll>
  );
}
