import { palette } from '@dialed/tokens';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion, FadeIn } from 'react-native-reanimated';
import { useApp } from '../../AppProvider';
import { useBlocksUi } from '../../blocks/BlocksUi';
import { Chip, Label, SheetHeader, SheetScroll } from '../../blocks/ui';
import { haptic } from '../../lib/haptics';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { BackIcon, CheckIcon } from '../../ui/icons';
import { T } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

// Create-card colours (prototype SWATCHES), from the shared palette tokens.
const SWATCHES = (['Mint', 'Sky', 'Rose', 'Sand'] as const).map((name) => ({
  name,
  pair: palette[name],
}));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Category picker, stacked over Add or Edit (prototype states cat, cat-create). */
export default function CategorySheet() {
  const { c, isLight } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const { for: target } = useLocalSearchParams<{ for?: 'add' | 'edit' }>();
  const { data, blocks } = useApp();
  const ui = useBlocksUi();
  const [q, setQ] = useState('');
  const [sw, setSw] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cats = useMemo(
    () =>
      (data?.schedule.categories ?? [])
        .filter((x) => !x.deleted_at)
        .sort((a, b) => a.sort - b.sort),
    [data],
  );
  const groups = useMemo(() => [...new Set(cats.map((x) => x.group_name))], [cats]);
  const [grp, setGrp] = useState<string>(
    () => (groups.includes('Life') ? 'Life' : groups.at(-1)) ?? 'Life',
  );
  const current = target === 'edit' ? ui.edit?.cur.category_id : ui.add?.category_id;

  const qq = norm(q);
  const list = qq ? cats.filter((x) => norm(x.name).includes(qq)) : cats;
  const exact = !qq || list.some((x) => norm(x.name) === qq);

  const apply = (id: string) => {
    if (target === 'edit' && ui.edit)
      ui.setEdit({ ...ui.edit, cur: { ...ui.edit.cur, category_id: id } });
    else if (ui.add) ui.setAdd({ ...ui.add, category_id: id, dirty: true });
  };
  const pick = (id: string) => {
    haptic.selection();
    apply(id);
    router.back();
  };
  const create = async () => {
    if (busy) return;
    setBusy(true);
    const name = q.trim();
    const r = await blocks.createCategory(name, grp, SWATCHES[sw]!.pair);
    setBusy(false);
    if (!r.ok) {
      haptic.warning();
      setError(r.message);
      return;
    }
    haptic.light();
    apply(r.id);
    router.back();
    toast(`Created ${name.replace(/\s+/g, ' ')} in ${grp}.`);
  };

  return (
    <SheetScroll>
      <View accessibilityLabel="Category picker" style={{ gap: 14 }}>
        <SheetHeader
          title="Category"
          size={28}
          left={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              hitSlop={6}
              style={{
                height: 44,
                paddingRight: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                width: 76,
              }}
            >
              <BackIcon color={c.acc2} />
              <T size={16} weight="600" color={c.acc2}>
                Back
              </T>
            </Pressable>
          }
        />
        <View
          style={{
            height: 52,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: c.acc,
            backgroundColor: c.surf,
            paddingHorizontal: 14,
            justifyContent: 'center',
          }}
        >
          <TextInput
            testID="cat-search"
            accessibilityLabel="Search or create a category"
            value={q}
            onChangeText={(v) => {
              setQ(v);
              setError(null);
            }}
            placeholder="Search or type a new one"
            placeholderTextColor={c.muted}
            selectionColor={c.acc}
            maxLength={40}
            autoCorrect={false}
            returnKeyType="done"
            style={{ fontSize: 17, fontWeight: '700', color: c.text }}
          />
        </View>

        <View style={{ gap: 6 }}>
          {!exact ? (
            <Animated.View
              entering={reduce ? FadeIn.duration(120) : FadeInDown.duration(350)}
              style={{ borderRadius: 18, backgroundColor: c.surf2, padding: 14 }}
            >
              <T size={16} weight="800">{`Create “${q.trim()}”`}</T>
              <T size={13} color={c.muted}>
                New category. Pick a colour and a group.
              </T>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Colour"
                style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}
              >
                {SWATCHES.map((s, i) => (
                  <Pressable
                    key={s.name}
                    accessibilityRole="radio"
                    accessibilityLabel={s.name}
                    accessibilityState={{ checked: i === sw }}
                    hitSlop={5}
                    onPress={() => setSw(i)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      borderWidth: i === sw ? 3 : 2,
                      borderColor: i === sw ? c.text : 'transparent',
                      backgroundColor: isLight ? s.pair[1] : s.pair[0],
                    }}
                  />
                ))}
              </View>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Group"
                style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}
              >
                {groups.map((g) => (
                  <Chip
                    key={g}
                    label={g}
                    on={g === grp}
                    style={{ flex: 1 }}
                    onPress={() => setGrp(g)}
                  />
                ))}
              </View>
              {error ? (
                <T size={13} weight="600" color={c.err} style={{ marginTop: 8 }}>
                  {error}
                </T>
              ) : null}
              <Button
                testID="cat-create"
                label="Create and use it"
                busy={busy}
                style={{ marginTop: 12, height: 48 }}
                onPress={() => void create()}
              />
            </Animated.View>
          ) : null}
          {groups.map((g) => {
            const rows = list.filter((x) => x.group_name === g);
            if (!rows.length) return null;
            return (
              <View key={g}>
                <View style={{ marginTop: 8, marginBottom: 2 }}>
                  <Label>{g}</Label>
                </View>
                {rows.map((x) => (
                  <Pressable
                    key={x.id}
                    accessibilityRole="button"
                    accessibilityLabel={x.name}
                    accessibilityState={{ selected: x.id === current }}
                    onPress={() => pick(x.id)}
                    style={({ pressed }) => ({
                      minHeight: 48,
                      paddingVertical: 6,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: c.surf2,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor: isLight ? x.color_light : x.color_dark,
                      }}
                    />
                    <T size={16} weight="700" style={{ flex: 1 }}>
                      {x.name}
                    </T>
                    {x.id === current ? <CheckIcon color={c.acc2} /> : null}
                  </Pressable>
                ))}
              </View>
            );
          })}
        </View>
      </View>
    </SheetScroll>
  );
}
