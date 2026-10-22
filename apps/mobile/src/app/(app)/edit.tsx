import { addDays, weekStartOf } from '@dialed/schedule';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useApp } from '../../AppProvider';
import { useBlocksUi } from '../../blocks/BlocksUi';
import {
  editOutcome,
  editPrimaryLabel,
  removeOutcome,
  setEnd,
  setStart,
  timeError,
  WEEKDAY_SHORT,
  WEEKDAYS,
} from '../../blocks/form';
import type { BlockFields } from '../../blocks/service';
import { ErrorText, Label, SheetHeader, SheetScroll, TimeField } from '../../blocks/ui';
import { haptic } from '../../lib/haptics';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { ChevronIcon } from '../../ui/icons';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

/** Edit block (prototype blockEdit): this day only vs every week, move within the week, skip or delete. */
export default function EditSheet() {
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { data, blocks, online } = useApp();
  const ui = useBlocksUi();
  const e = ui.edit;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (leaving) router.dismissAll();
  }, [leaving, router]);
  if (!e || !data) return null;

  const { block, orig, cur, scope, today } = e;
  const routine = block.source === 'routine';
  const cat = data.schedule.categories.find((x) => x.id === cur.category_id) ?? null;
  const primary = editPrimaryLabel(orig, cur);
  const remove = removeOutcome({ routine, scope, today, title: orig.title });
  const set = (p: Partial<typeof cur>) => ui.setEdit({ ...e, cur: { ...cur, ...p } });

  const close = (msg: string, action?: { label: string; onPress: () => void }) => {
    setLeaving(true);
    ui.setEdit(null);
    toast(msg, action);
  };

  const onSave = async () => {
    if (busy || primary.disabled) return;
    const title = cur.title.trim();
    const bad = !title
      ? 'Give the block a name, like “Capstone reading”.'
      : timeError(cur.start, cur.end);
    if (bad) {
      setError(bad);
      haptic.warning();
      return;
    }
    setBusy(true);
    const f: Partial<BlockFields> = {};
    if (title !== orig.title) f.title = title;
    if (cur.start !== orig.start) f.start_min = cur.start;
    if (cur.end !== orig.end) f.end_min = cur.end;
    if (cur.category_id !== orig.category_id) f.category_id = cur.category_id;
    const o = editOutcome({ routine, scope, today, day: cur.day, title, online });
    const toDate = addDays(weekStartOf(block.date), cur.day);
    try {
      const r =
        o.kind === 'modifyOnce'
          ? await blocks.modifyOnce(block, f)
          : o.kind === 'modifyEvery'
            ? await blocks.modifyEvery(block, f, block.date)
            : o.kind === 'moveOnce'
              ? await blocks.moveOnce(block, toDate, f)
              : await blocks.moveEvery(block, cur.day, f, block.date);
      ui.flash(cur.day === today ? r.key : null);
      haptic.success();
      close(o.toast);
    } catch {
      setBusy(false);
      toast('That change couldn’t be saved on this phone. Try again.');
    }
  };

  const onRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r =
        remove.kind === 'skip'
          ? await blocks.skipOnce(block)
          : await blocks.deleteBlock(block, block.date);
      haptic.light();
      close(remove.toast, {
        label: 'Undo',
        onPress: () =>
          void r
            .undo()
            .then(() => toast('Put back.'))
            .catch(() => toast('That couldn’t be put back. Try again.')),
      });
    } catch {
      setBusy(false);
      toast('That change couldn’t be saved on this phone. Try again.');
    }
  };

  return (
    <SheetScroll>
      <View accessibilityLabel="Edit one block" style={{ gap: 14 }}>
        <SheetHeader title="Edit block" size={28} onClose={() => router.back()} />
        <View style={{ gap: 6 }}>
          <Label>Name</Label>
          <TextInput
            testID="edit-name"
            accessibilityLabel="Name"
            value={cur.title}
            onChangeText={(title) => {
              setError(null);
              set({ title });
            }}
            selectionColor={c.acc}
            maxLength={120}
            returnKeyType="done"
            style={{
              height: 52,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: c.line,
              backgroundColor: c.surf,
              paddingHorizontal: 16,
              fontSize: 17,
              fontWeight: '600',
              color: c.text,
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Category, ${cat?.name ?? 'none'}`}
          accessibilityHint="Opens the category picker"
          onPress={() => router.push('/category?for=edit')}
          hitSlop={6}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
        >
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              backgroundColor: cat ? (isLight ? cat.color_light : cat.color_dark) : c.line,
            }}
          />
          <T weight="700">{cat?.name ?? 'Pick a category'}</T>
          <ChevronIcon color={c.muted} size={14} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TimeField
            label="Starts"
            testID="edit-start"
            value={cur.start}
            onChange={(m) => {
              setError(null);
              set(setStart(cur, m));
            }}
          />
          <TimeField
            label="Ends"
            testID="edit-end"
            value={cur.end}
            bad={!!error && error.startsWith('End')}
            onChange={(m) => {
              setError(null);
              set(setEnd(cur, m));
            }}
          />
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={{ gap: 6 }}>
          <Label>Day</Label>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Move to day"
            style={{ flexDirection: 'row', gap: 4 }}
          >
            {WEEKDAY_SHORT.map((d, i) => {
              const on = cur.day === i;
              return (
                <Pressable
                  key={d}
                  testID={`edit-day-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={WEEKDAYS[i]}
                  accessibilityState={{ selected: on }}
                  hitSlop={{ top: 2, bottom: 2 }}
                  onPress={() => {
                    haptic.selection();
                    set({ day: i });
                  }}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: on ? c.acc : c.surf2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <T size={12} weight="700" color={on ? c.ink : c.text}>
                    {d}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </View>
        {routine ? (
          <View style={{ gap: 6 }}>
            <Label>Change</Label>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Apply to"
              style={{
                flexDirection: 'row',
                gap: 4,
                padding: 4,
                borderRadius: 16,
                backgroundColor: c.surf2,
              }}
            >
              {(['once', 'every'] as const).map((s) => {
                const on = scope === s;
                const label =
                  s === 'once' ? `This ${WEEKDAYS[today]} only` : `Every ${WEEKDAYS[today]}`;
                return (
                  <Pressable
                    key={s}
                    testID={`edit-scope-${s}`}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: on }}
                    hitSlop={{ top: 2, bottom: 2 }}
                    onPress={() => ui.setEdit({ ...e, scope: s })}
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: on ? c.surf : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#000',
                      shadowOpacity: on ? 0.15 : 0,
                      shadowRadius: 2,
                      shadowOffset: { width: 0, height: 1 },
                    }}
                  >
                    <T size={14} weight={on ? '800' : '600'} numberOfLines={1}>
                      {label}
                    </T>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <Button
          testID="edit-save"
          label={primary.label}
          disabled={primary.disabled}
          busy={busy}
          onPress={() => void onSave()}
        />
        <Button
          testID="edit-remove"
          kind="secondary"
          fg={c.err}
          label={remove.label}
          disabled={busy}
          onPress={() => void onRemove()}
        />
      </View>
    </SheetScroll>
  );
}
