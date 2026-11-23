'use client';

import { Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useTheme, type Theme } from '@/lib/theme';

/** Icon button: tap to flip between dark and light. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cn('flex size-9 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30', className)}>
      {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

/** Two-option segmented control for the profile page. */
export function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  const opts: { key: Theme; label: string; Icon: typeof Sun }[] = [
    { key: 'dark', label: 'Dark', Icon: Moon },
    { key: 'light', label: 'Light', Icon: Sun },
  ];
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Theme">
      {opts.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={theme === key}
          onClick={() => setTheme(key)}
          className={cn('flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold', theme === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}>
          <Icon className="size-4" />{label}
        </button>
      ))}
    </div>
  );
}
