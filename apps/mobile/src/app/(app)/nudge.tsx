import { View } from 'react-native';
import { useBlocksUi } from '../../blocks/BlocksUi';
import { SheetScroll } from '../../blocks/ui';
import { APP_NAME } from '../../config';
import { requestNotificationPermission } from '../../notifications/reminders';
import { useTheme } from '../../theme/theme';
import { Button } from '../../ui/Button';
import { DisplayTitle } from '../../ui/DisplayTitle';
import { BellIcon } from '../../ui/icons';
import { T } from '../../ui/Text';

/** Get a nudge (prototype notifAsk): explains first, so the one-time iOS prompt is not wasted. */
export default function NudgeSheet() {
  const { c } = useTheme();
  const { nudge } = useBlocksUi();
  // Swiped away without choosing: back to the Add sheet, nothing saved. A choice saves and closes both sheets.
  const choose = async (on: boolean) => {
    if (!on) return nudge.run('later');
    nudge.run(await requestNotificationPermission());
  };
  return (
    <SheetScroll>
      <View accessibilityLabel="Ask before the iPhone prompt" style={{ gap: 14 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: c.acc,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BellIcon color={c.ink} size={28} />
        </View>
        <DisplayTitle size={32} color={c.text}>
          Get a nudge before blocks start
        </DisplayTitle>
        <T size={15} weight="500" color={c.muted} style={{ lineHeight: 20 }}>
          {`${APP_NAME} can tap you 10 minutes before Gym, Sermon Sync or anything else. Your iPhone will ask once. You can turn it off anytime.`}
        </T>
        <Button testID="nudge-on" label="Turn on reminders" onPress={() => void choose(true)} />
        <Button
          testID="nudge-later"
          kind="secondary"
          label="Not now"
          onPress={() => void choose(false)}
        />
      </View>
    </SheetScroll>
  );
}
