import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore, type ThemeMode } from '../stores/theme-store';

const THEME_OPTIONS: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
  { mode: 'light', icon: Sun, label: 'Light' },
  { mode: 'dark', icon: Moon, label: 'Dark' },
  { mode: 'system', icon: Monitor, label: 'System' },
];

export function ThemeSelector() {
  const { themeMode, setThemeMode } = useThemeStore();

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/50">
      {THEME_OPTIONS.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => setThemeMode(mode)}
          className={cn(
            'p-1.5 rounded transition-colors',
            themeMode === mode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title={label}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
