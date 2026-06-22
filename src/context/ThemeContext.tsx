import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type Theme = 'light' | 'dark' | 'obsidian' | 'abyss' | 'catppuccin';

interface ThemeContextValue {
  theme: Theme;
  dark: boolean;
  cycle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', dark: true, cycle: () => {}, setTheme: () => {} });

function applyTheme(theme: Theme) {
  const cl = document.documentElement.classList;
  cl.remove('dark', 'obsidian', 'abyss', 'catppuccin');
  if (theme === 'dark') cl.add('dark');
  if (theme === 'obsidian') { cl.add('dark'); cl.add('obsidian'); }
  if (theme === 'abyss') { cl.add('dark'); cl.add('abyss'); }
  if (theme === 'catppuccin') { cl.add('dark'); cl.add('catppuccin'); }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved === 'light' || saved === 'dark' || saved === 'obsidian' || saved === 'abyss' || saved === 'catppuccin') return saved;
    return 'obsidian';
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((t) => t === 'light' ? 'dark' : t === 'dark' ? 'obsidian' : t === 'obsidian' ? 'abyss' : t === 'abyss' ? 'catppuccin' : 'light');
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
