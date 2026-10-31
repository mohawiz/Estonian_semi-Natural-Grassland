import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type TourId = 'main' | 'demo';

interface UIState {
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  /** Open the assistant with a question pre-filled (and optionally sent). */
  askAssistant: (question: string) => void;
  pendingQuestion: string | null;
  takePendingQuestion: () => string | null;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  tour: TourId | null;
  /** The meadow window above the sheet; pages may portal a hero into it. */
  heroSlot: HTMLDivElement | null;
  setHeroSlot: (el: HTMLDivElement | null) => void;
  startTour: (id: TourId) => void;
  endTour: () => void;
}

const Ctx = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [pendingQuestion, setPending] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tour, setTour] = useState<TourId | null>(null);
  const [heroSlot, setHeroSlot] = useState<HTMLDivElement | null>(null);

  const askAssistant = useCallback((q: string) => {
    setPending(q);
    setAssistantOpen(true);
  }, []);
  const takePendingQuestion = useCallback(() => {
    let q: string | null = null;
    setPending((p) => ((q = p), null));
    return q;
  }, []);

  const value = useMemo(
    () => ({
      assistantOpen,
      setAssistantOpen,
      askAssistant,
      pendingQuestion,
      takePendingQuestion,
      sidebarOpen,
      setSidebarOpen,
      shortcutsOpen,
      setShortcutsOpen,
      tour,
      heroSlot,
      setHeroSlot,
      startTour: (id: TourId) => {
        setSidebarOpen(false);
        setTour(id);
      },
      endTour: () => setTour(null),
    }),
    [assistantOpen, askAssistant, pendingQuestion, takePendingQuestion, sidebarOpen, shortcutsOpen, tour, heroSlot],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI(): UIState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside UIProvider');
  return v;
}
