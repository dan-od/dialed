import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { SheetHeader, SheetScroll } from '../../blocks/ui';
import { APP_NAME } from '../../config';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { T } from '../../ui/Text';

/** Turn reminders back on (prototype permHelp): after a denial iOS won't ask again, so show the path. */
export default function RemindersHelpSheet() {
  const { c } = useTheme();
  const router = useRouter();
  const steps = [
    'Open the Settings app',
    'Tap Notifications',
    `Tap ${APP_NAME}`,
    'Turn on Allow Notifications',
  ];
  return (
    <SheetScroll>
      <View accessibilityLabel="Turn reminders back on" style={{ gap: 14 }}>
        <SheetHeader title="Turn reminders back on" size={28} onClose={() => router.back()} />
        <T size={15} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
          {`You chose Don’t Allow earlier, so iPhone won’t let ${APP_NAME} ask again. Turn it on here:`}
        </T>
        <View style={{ gap: 8, paddingLeft: 4 }}>
          {steps.map((s, i) => (
            <T key={s} size={16} weight="600">
              {`${i + 1}. ${s}`}
            </T>
          ))}
        </View>
        <Button kind="secondary" label="Done" onPress={() => router.back()} />
      </View>
    </SheetScroll>
  );
}
