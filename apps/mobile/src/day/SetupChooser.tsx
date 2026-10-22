import { ToastAwareScroll } from '../ui/ToastAwareScroll';
import { Pressable, View } from 'react-native';
import { aiName } from '../config';
import { useTheme } from '../theme/theme';
import { H1, Sub } from '../ui/Chrome';
import { AiMark, CalendarIcon, CameraIcon, PlusIcon } from '../ui/icons';
import { T } from '../ui/Text';

export type SetupOption = 'timetable' | 'describe' | 'calendar' | 'build';

/** Empty-Day setup chooser (owned by Flow 03; each option's flow is owned by 02/05/06). */
export function SetupChooser({ onPick }: { onPick: (o: SetupOption) => void }) {
  const { c } = useTheme();
  const ai = aiName();
  const opts: {
    id: SetupOption;
    title: string;
    body: string;
    icon: (color: string) => React.ReactNode;
    hero?: boolean;
  }[] = [
    {
      id: 'timetable',
      hero: true,
      title: 'Add your timetable',
      body: `Photo, screenshot, PDF or Word doc. ${ai} turns it into classes you check.`,
      icon: (col) => <CameraIcon color={col} />,
    },
    {
      id: 'describe',
      title: 'Describe your week',
      body: `Type or say it. ${ai} drafts, you approve.`,
      icon: (col) => <AiMark color={col} size={22} />,
    },
    {
      id: 'calendar',
      title: 'Import from Apple Calendar',
      body: 'Repeating events become your routine.',
      icon: (col) => <CalendarIcon color={col} />,
    },
    {
      id: 'build',
      title: 'Build it myself',
      body: 'Start from an empty routine.',
      icon: (col) => <PlusIcon color={col} />,
    },
  ];
  return (
    <ToastAwareScroll base={110}>
      <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
        <H1 size={68}>Set up your week</H1>
        <Sub>Start with your classes. Projects, gym and meals fit around them after.</Sub>
        <View style={{ gap: 10, marginTop: 20 }}>
          {opts.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${o.body}`}
              onPress={() => onPick(o.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                gap: 14,
                alignItems: 'center',
                padding: 14,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: o.hero ? c.acc : c.line,
                backgroundColor: o.hero ? c.acc : c.surf,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  backgroundColor: o.hero ? c.ink : c.surf2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {o.icon(o.hero ? '#FF5A1F' : c.text)}
              </View>
              <View style={{ flex: 1 }}>
                <T size={16} weight="700" color={o.hero ? c.ink : c.text}>
                  {o.title}
                </T>
                <T
                  size={13}
                  weight="500"
                  color={o.hero ? c.ink : c.text}
                  style={{ opacity: 0.8, lineHeight: 17, marginTop: 2 }}
                >
                  {o.body}
                </T>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </ToastAwareScroll>
  );
}
