import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ImportingContextValue = {
  startImport: () => void;
  finishImport: () => void;
  isImporting: boolean;
};

const ImportingContext = createContext<ImportingContextValue | null>(null);

export function useImporting() {
  const context = useContext(ImportingContext);
  if (!context) {
    throw new Error('useImporting must be used within ImportingProvider');
  }
  return context;
}

export function useImportingEffect(isPending: boolean) {
  const { startImport, finishImport } = useImporting();
  const previous = useRef(false);

  useEffect(() => {
    if (isPending && !previous.current) {
      startImport();
    }

    if (!isPending && previous.current) {
      finishImport();
    }

    previous.current = isPending;

    return () => {
      if (previous.current) {
        finishImport();
        previous.current = false;
      }
    };
  }, [finishImport, isPending, startImport]);
}

export function ImportingProvider({ children }: { children: ReactNode }) {
  const [activeCount, setActiveCount] = useState(0);

  const startImport = useCallback(() => {
    setActiveCount((count) => count + 1);
  }, []);

  const finishImport = useCallback(() => {
    setActiveCount((count) => Math.max(0, count - 1));
  }, []);

  const value = useMemo(
    () => ({
      startImport,
      finishImport,
      isImporting: activeCount > 0,
    }),
    [activeCount, finishImport, startImport]
  );

  return (
    <ImportingContext.Provider value={value}>
      {children}
      {value.isImporting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-5 text-center shadow-xl"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-primary" />
            <div className="text-sm font-medium text-foreground">Importing...</div>
            <div className="text-xs text-muted-foreground">
              Please keep this tab open while we process your data.
            </div>
          </div>
        </div>
      )}
    </ImportingContext.Provider>
  );
}
