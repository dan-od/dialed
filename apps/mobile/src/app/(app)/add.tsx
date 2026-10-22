import { overlapOf, resolveDay, termFor, weekdayOf } from '@dialed/schedule';
import { usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  Pressable,
  Switch,
  TextInput,
  View,
  findNodeHandle,
  type TextInputInstance,
  type ViewInstance,
} from 'react-native';
import { useApp } from '../../AppProvider';
import { useBlocksUi, type AddDraft, type NudgeChoice } from '../../blocks/BlocksUi';
import {
  addPrimaryLabel,
  addToast,
  ALERTS,
  LENGTHS,
  lengthChip,
  overlapSpoken,
  overlapText,
  setEnd,
  setLength,
  setStart,
  validateAdd,
  WEEKDAYS,
  type AddErrors,
  type Perm,
} from '../../blocks/form';
import {
  Chip,
  ErrorText,
  Group,
  GroupRow,
  Label,
  SheetHeader,
  SheetScroll,
  TimeField,
} from '../../blocks/ui';
import { APP_NAME } from '../../config';
import { haptic } from '../../lib/haptics';
import { notificationPermission } from '../../notifications/reminders';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Chrome';
import { BellIcon, ChevronIcon, RepeatIcon } from '../../ui/icons';
import { Notice } from '../../ui/Notice';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

/** Flow 04 Add sheet (prototype states add, add-invalid, add-overlap; D-32 alert default off). */
export default function AddSheet() {
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { data, blocks, online } = useApp();
  const ui = useBlocksUi();
  const f = ui.add;
  const [errors, setErrors] = useState<AddErrors>({});
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [perm, setPerm] = useState<Perm>('undetermined');
  const [recent, setRecent] = useState<string[]>([]);
  const nameRef = useRef<TextInputInstance>(null);
  const catRef = useRef<ViewInstance>(null);
  const endRef = useRef<ViewInstance>(null);

  useEffect(() => {
    void notificationPermission().then(setPerm);
    void blocks.recentCategories().then(setRecent);
  }, [blocks, f?.category_id]);

  // Drag-down, Close and scrim all go through here: a dirty form asks first (Discard dialog).
  usePreventRemove(!!f?.dirty && !saving && !leaving, () => {
    haptic.warning();
    setDiscard(true);
  });
  useEffect(() => {
    if (leaving) router.dismissAll();
  }, [leaving, router]);
  useEffect(() => {
    if (!f && !leaving) router.back(); // opened without a draft (e.g. restored route)
  }, [f, leaving, router]);

  const schedule = data?.schedule;
  const day = useMemo(
    () => (f && schedule ? resolveDay(f.date, schedule).blocks : []),
    [f, schedule],
  );
  const term = f && schedule ? termFor(f.date, schedule.terms) : null;
  const routine = term ? schedule?.routines.find((r) => r.term_id === term.id) : undefined;
  if (!f || !schedule) return null;

  const weekday = WEEKDAYS[weekdayOf(f.date)]!;
  const cats = schedule.categories.filter((x) => !x.deleted_at);
  const cat = cats.find((x) => x.id === f.category_id) ?? null;
  const swatch = (x: { color_dark: string; color_light: string }) =>
    isLight ? x.color_light : x.color_dark;
  const overlap = overlapOf(day, f.start, f.end);
  const len = lengthChip(f);
  const alertLabel = ALERTS.find((a) => a.value === f.alert)!.label;

  const set = (p: Partial<AddDraft>) => ui.setAdd({ ...f, ...p, dirty: true });
  const setTimes = (t: { start: number; end: number }) => {
    setErrors((e) => ({ ...e, time: undefined }));
    set({ ...t, overlapOk: false });
  };

  const focus = (ref: { current: unknown }) => {
    const node = findNodeHandle(ref.current as never);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  };

  const save = async (permission: Perm, withAlert: boolean) => {
    setSaving(true);
    try {
      const fields = {
        title: f.title.trim(),
        start_min: f.start,
        end_min: f.end,
        category_id: f.category_id!,
      };
      const repeat = f.repeat && !!routine;
      const r = repeat
        ? await blocks.addRoutine(routine!.id, weekdayOf(f.date), fields, f.date, f.date)
        : await blocks.addOneOff(f.date, fields);
      if (withAlert && f.alert !== null && r.key)
        await blocks.setAlert(r.key.split(':')[0]!, f.alert);
      ui.flash(r.key);
      setLeaving(true);
      ui.setAdd(null);
      haptic.success();
      toast(
        addToast({
          weekday,
          repeat,
          online,
          alert: withAlert ? f.alert : null,
          perm: permission,
        }),
      );
    } catch {
      setSaving(false);
      toast('That block couldn’t be saved on this phone. Try again.');
    }
  };

  const onAdd = async () => {
    if (saving) return;
    const e = validateAdd(f);
    setErrors(e);
    if (Object.keys(e).length) {
      haptic.warning();
      focus(e.title ? nameRef : e.category ? catRef : endRef);
      AccessibilityInfo.announceForAccessibility(Object.values(e).join(' '));
      return;
    }
    if (overlap && !f.overlapOk) {
      ui.setAdd({ ...f, overlapOk: true });
      haptic.warning();
      AccessibilityInfo.announceForAccessibility(overlapSpoken(overlap.title));
      return;
    }
    const p = await notificationPermission();
    setPerm(p);
    if (f.alert !== null && p === 'undetermined') {
      ui.nudge.set((choice: NudgeChoice) => {
        void save(choice === 'later' ? 'undetermined' : choice, choice !== 'later');
      });
      router.push('/nudge');
      return;
    }
    void save(p, true);
  };

  const pickAlert = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Push alert',
        options: [...ALERTS.map((a) => a.label), 'Cancel'],
        cancelButtonIndex: ALERTS.length,
        userInterfaceStyle: isLight ? 'light' : 'dark',
      },
      (i) => {
        if (i < ALERTS.length) set({ alert: ALERTS[i]!.value });
      },
    );

  return (
    <SheetScroll>
      <View accessibilityLabel="Add a block" accessibilityViewIsModal style={{ gap: 14 }}>
        <SheetHeader title={`Add to ${weekday}`} onClose={() => router.back()} />
        {!online ? (
          <Notice
            inline
            stamp="Offline"
            text="This saves on your phone and syncs when you reconnect."
          />
        ) : null}

        <View style={{ gap: 6 }}>
          <Label>What are you working on</Label>
          <TextInput
            ref={nameRef}
            testID="add-name"
            accessibilityLabel="What are you working on"
            accessibilityHint={errors.title}
            aria-invalid={!!errors.title}
            value={f.title}
            onChangeText={(title) => set({ title })}
            placeholder="Capstone reading"
            placeholderTextColor={c.muted}
            selectionColor={c.acc}
            maxLength={120}
            returnKeyType="done"
            autoCorrect={false}
            style={{
              height: 52,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: errors.title ? c.err : c.line,
              backgroundColor: c.surf,
              paddingHorizontal: 16,
              fontSize: 17,
              fontWeight: '600',
              color: c.text,
            }}
          />
          {errors.title ? <ErrorText>{errors.title}</ErrorText> : null}
        </View>

        <View style={{ gap: 6 }}>
          <Label>Category</Label>
          <Pressable
            ref={catRef}
            testID="add-category"
            accessibilityRole="button"
            accessibilityLabel={
              cat ? `Category, ${cat.name}, ${cat.group_name}` : 'Pick a category'
            }
            accessibilityHint={errors.category}
            onPress={() => router.push('/category?for=add')}
            style={{
              height: 52,
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: errors.category ? c.err : 'transparent',
              backgroundColor: c.surf2,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 14,
            }}
          >
            {cat ? (
              <>
                <View
                  style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: swatch(cat) }}
                />
                <T size={16} weight="700" style={{ flex: 1 }} numberOfLines={1}>
                  {cat.name}
                </T>
                <T size={13} color={c.muted}>
                  {cat.group_name}
                </T>
              </>
            ) : (
              <T size={16} weight="600" color={c.muted} style={{ flex: 1 }}>
                Pick a category
              </T>
            )}
            <ChevronIcon color={c.text} />
          </Pressable>
          {errors.category ? <ErrorText>{errors.category}</ErrorText> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {recent
              .map((id) => cats.find((x) => x.id === id))
              .filter((x) => !!x)
              .map((x) => (
                <Chip
                  key={x.id}
                  label={x.name}
                  swatch={swatch(x)}
                  on={f.category_id === x.id}
                  onPress={() => {
                    haptic.selection();
                    setErrors((e) => ({ ...e, category: undefined }));
                    set({ category_id: x.id });
                  }}
                />
              ))}
            <Chip
              label="+ New"
              a11yLabel="New category"
              dashed
              onPress={() => router.push('/category?for=add')}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TimeField
            label="Starts"
            testID="add-start"
            value={f.start}
            onChange={(m) => setTimes(setStart(f, m))}
          />
          <View ref={endRef} style={{ flex: 1 }}>
            <TimeField
              label="Ends"
              testID="add-end"
              value={f.end}
              bad={!!errors.time}
              onChange={(m) => setTimes(setEnd(f, m))}
            />
          </View>
        </View>
        {errors.time ? <ErrorText>{errors.time}</ErrorText> : null}

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {LENGTHS.map((l) => (
            <Chip
              key={l.min}
              label={l.label}
              on={len === l.min}
              style={{ flex: 1, paddingHorizontal: 4 }}
              a11yLabel={`Length ${l.label}`}
              onPress={() => {
                haptic.selection();
                setTimes(setLength(f, l.min));
              }}
            />
          ))}
        </View>

        {overlap ? <Notice inline stamp="Overlap" text={overlapText(overlap)} /> : null}

        <Group>
          {routine ? (
            <GroupRow
              icon={<RepeatIcon color={c.acc2} />}
              label={`Repeat every ${weekday}`}
              right={
                <Switch
                  testID="add-repeat"
                  accessibilityLabel={`Repeat every ${weekday}`}
                  value={f.repeat}
                  onValueChange={(repeat) => set({ repeat })}
                  trackColor={{ true: c.acc, false: c.line }}
                  thumbColor={f.repeat ? c.ink : c.muted}
                  ios_backgroundColor={c.line}
                />
              }
            />
          ) : null}
          <GroupRow
            icon={<BellIcon color={c.acc2} />}
            label="Push alert"
            last={!(perm === 'denied' && f.alert !== null)}
            onPress={pickAlert}
            a11y={{ label: 'Push alert', value: alertLabel }}
            right={
              <T size={15} weight="600" color={c.muted}>
                {alertLabel}
              </T>
            }
          />
          {perm === 'denied' && f.alert !== null ? (
            <View style={{ paddingTop: 4, paddingHorizontal: 14, paddingBottom: 14 }}>
              <Notice
                inline
                stamp="Reminders off"
                kind="quiet"
                text={`iPhone Settings has notifications turned off for ${APP_NAME}, so this alert won’t fire.`}
                action={{ label: 'Turn them on', onPress: () => router.push('/reminders-help') }}
              />
            </View>
          ) : null}
        </Group>

        <Button
          testID="add-save"
          label={addPrimaryLabel({ overlap: !!overlap, overlapOk: f.overlapOk, saving })}
          busy={saving}
          onPress={() => void onAdd()}
        />
      </View>
      <Dialog visible={discard} title="Discard this block?" body="What you typed will be lost.">
        <Button
          kind="secondary"
          label="Keep editing"
          style={{ marginTop: 6 }}
          onPress={() => setDiscard(false)}
        />
        <Button
          kind="destructive"
          label="Discard"
          onPress={() => {
            haptic.warning();
            setDiscard(false);
            ui.setAdd(null);
            setLeaving(true);
          }}
        />
      </Dialog>
    </SheetScroll>
  );
}
