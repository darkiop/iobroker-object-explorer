import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type Theme = 'light' | 'dark' | 'abyss' | 'catppuccin-frappe' | 'catppuccin-macchiato' | 'catppuccin-mocha';

interface ThemeContextValue {
  theme: Theme;
  dark: boolean;
  cycle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', dark: true, cycle: () => {}, setTheme: () => {} });

function applyTheme(theme: Theme) {
  const cl = document.documentElement.classList;
  cl.remove('dark', 'abyss', 'catppuccin-frappe', 'catppuccin-macchiato', 'catppuccin-mocha');
  if (theme === 'dark') cl.add('dark');
  if (theme === 'abyss') { cl.add('dark'); cl.add('abyss'); }
  if (theme === 'catppuccin-frappe') { cl.add('dark'); cl.add('catppuccin-frappe'); }
  if (theme === 'catppuccin-macchiato') { cl.add('dark'); cl.add('catppuccin-macchiato'); }
  if (theme === 'catppuccin-mocha') { cl.add('dark'); cl.add('catppuccin-mocha'); }
}

function migrateTheme(raw: string | null): Theme {
  if (raw === 'obsidian') return 'catppuccin-mocha';
  if (raw === 'catppuccin') return 'catppuccin-frappe';
  const valid: Theme[] = ['light', 'dark', 'abyss', 'catppuccin-frappe', 'catppuccin-macchiato', 'catppuccin-mocha'];
  if (valid.includes(raw as Theme)) return raw as Theme;
  return 'catppuccin-mocha';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const raw = localStorage.getItem('theme');
    return migrateTheme(raw);
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((t) => {
      const order: Theme[] = ['light', 'dark', 'abyss', 'catppuccin-frappe', 'catppuccin-macchiato', 'catppuccin-mocha'];
      return order[(order.indexOf(t) + 1) % order.length];
    });
  }, []);

  const value = useMemo(() => ({ theme, dark: theme !== 'light', cycle, setTheme }), [theme, cycle, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
