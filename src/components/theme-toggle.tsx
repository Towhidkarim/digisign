import { Monitor, Moon, Sun } from 'lucide-react';

import { type Theme, useTheme } from '#/components/theme-provider.tsx';
import { Button } from '#/components/ui/button.tsx';

const NEXT: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const LABEL: Record<Theme, string> = {
  system: 'Theme: system. Switch to light',
  light: 'Theme: light. Switch to dark',
  dark: 'Theme: dark. Switch to system',
};

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** Icon button that cycles system, light, dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const Icon = ICON[theme];
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      onClick={() => setTheme(NEXT[theme])}
    >
      <Icon strokeWidth={1.75} />
    </Button>
  );
}
