import { useApp } from '../AppProvider';
import { useTheme } from '../theme/theme';
import { IconButton } from '../ui/Button';
import { ThemeIcon } from '../ui/icons';

export function ThemeButton() {
  const { c, isLight } = useTheme();
  const { toggleTheme } = useApp();
  return (
    <IconButton label="Theme: follows system" onPress={() => void toggleTheme(isLight)}>
      <ThemeIcon color={c.text} />
    </IconButton>
  );
}
