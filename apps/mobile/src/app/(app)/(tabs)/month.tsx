import { View } from 'react-native';
import { useTheme } from '../../../theme/theme';
import { H1, Header, Sub } from '../../../ui/Chrome';

/** Flow 03 Month view lands in the next Flow 03 step (this session's slice is Day). */
export default function MonthScreen() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header left={null} />
      <View style={{ paddingHorizontal: 20 }}>
        <H1 size={68}>Month</H1>
        <Sub>Not built yet in this build. Day is the first slice.</Sub>
      </View>
    </View>
  );
}
