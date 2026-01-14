import { useState, useCallback, useEffect } from 'react';

export function useColumnResizer(storageKey: string, defaultWidths: string[]) {
  const [widths, setWidths] = useState<string[]>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : defaultWidths;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  }, [widths, storageKey]);

  const updateWidth = useCallback((index: number, newWidth: number) => {
    setWidths((prev) => {
      const next = [...prev];
      next[index] = `${newWidth}px`;
      return next;
    });
  }, []);

  const gridTemplateColumns = widths.join(' ');

  return { widths, updateWidth, gridTemplateColumns };
}
