import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const readCookie = (name: string) => {
  const match = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const cookieTheme = readCookie('theme') as Theme | null;
    if (cookieTheme === 'light' || cookieTheme === 'dark') return cookieTheme;

    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
    document.cookie = `theme=${encodeURIComponent(theme)}; path=/; max-age=31536000; SameSite=Lax`;
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return { theme, toggleTheme };
}
