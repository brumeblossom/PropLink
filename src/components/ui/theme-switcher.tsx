'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLight = mounted && resolvedTheme === 'light';
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <div
      role="group"
      aria-label="Theme"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 flex items-center p-[5px] gap-[4px] rounded-full bg-card/60 backdrop-blur-md backdrop-saturate-150 border border-border shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-label="Light mode"
        aria-pressed={isLight}
        className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isLight
            ? 'bg-[#FFFFFF] text-[#0B1530] shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
            : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-accent'
        )}
      >
        <Sun className={cn('w-5 h-5 shrink-0', isLight && 'text-[#0B1530]')} />
      </button>

      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-label="Dark mode"
        aria-pressed={isDark}
        className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDark
            ? 'bg-[#FFFFFF] text-[#0B1530] shadow-[0_2px_8px_rgba(0,0,0,0.12)]'
            : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-accent'
        )}
      >
        <Moon className={cn('w-5 h-5 shrink-0', isDark && 'text-[#0B1530]')} />
      </button>
    </div>
  );
}
