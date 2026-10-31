import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { translate, type MessageKey, type Vars } from '../i18n';
import type { ChecklistState, Farm, Lang, LogEntry, OnboardingTask, Parcel, PhotoMeta, SavedReport, Settings } from '../lib/types';
import * as store from '../services/db';
import { buildDemoSnapshot } from '../services/demo';

type Status = 'loading' | 'ready' | 'error';

export interface AppState {
  status: Status;
  settings: Settings;
  data: store.Snapshot;
  farm: Farm | undefined;
  lang: Lang;
  t: (key: MessageKey | string, vars?: Vars) => string;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  completeTask: (task: OnboardingTask) => void;
  saveFarm: (farm: Farm) => Promise<void>;
  saveParcel: (p: Parcel) => Promise<void>;
  deleteParcel: (id: string) => Promise<() => Promise<void>>;
  saveEntry: (e: LogEntry) => Promise<void>;
  deleteEntry: (id: string) => Promise<() => Promise<void>>;
  savePhoto: (p: PhotoMeta) => Promise<void>;
  deletePhoto: (id: string) => Promise<void>;
  saveChecklist: (c: ChecklistState) => Promise<void>;
  saveReport: (r: SavedReport) => Promise<void>;
  deleteReport: (id: string) => Promise<() => Promise<void>>;
  replaceAll: (s: store.Snapshot) => Promise<void>;
  loadDemo: () => Promise<void>;
  resetAll: () => Promise<void>;
}

const EMPTY: store.Snapshot = { farms: [], parcels: [], entries: [], photos: [], checklists: [], reports: [] };
const Ctx = createContext<AppState | null>(null);

export function uid(prefix = ''): string {
  return prefix + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [settings, setSettings] = useState<Settings>(store.DEFAULT_SETTINGS);
  const [data, setData] = useState<store.Snapshot>(EMPTY);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    Promise.all([store.loadSettings(), store.loadAll()])
      .then(([s, d]) => {
        if (!s.welcomeDone && !localStorage.getItem('ga-lang-chosen')) {
          // First run: suggest the browser language.
          s = { ...s, lang: navigator.language?.toLowerCase().startsWith('et') ? 'et' : s.lang };
        }
        setSettings(s);
        setData(d);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.lang;
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.setAttribute('data-effects', settings.effects);
  }, [settings.lang, settings.theme, settings.effects]);

  const lang = settings.lang;
  const t = useCallback((key: MessageKey | string, vars?: Vars) => translate(lang, key, vars), [lang]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await store.saveSettings(next);
  }, []);

  const completeTask = useCallback(
    (task: OnboardingTask) => {
      const s = settingsRef.current;
      if (s.onboarding[task]) return;
      const next = { ...s, onboarding: { ...s.onboarding, [task]: true } };
      settingsRef.current = next;
      setSettings(next);
      void store.saveSettings(next);
    },
    [],
  );

  const upsert = <K extends keyof store.Snapshot>(k: K, key: string, value: store.Snapshot[K][number]) =>
    setData((d) => {
      const list = d[k] as store.Snapshot[K][number][];
      const idOf = (x: any) => (k === 'checklists' ? x.parcelId : x.id);
      const exists = list.some((x) => idOf(x) === key);
      return { ...d, [k]: exists ? list.map((x) => (idOf(x) === key ? value : x)) : [...list, value] };
    });

  const saveFarm = useCallback(async (f: Farm) => {
    await store.put('farms', f);
    upsert('farms', f.id, f);
  }, []);

  const saveParcel = useCallback(async (p: Parcel) => {
    await store.put('parcels', p);
    upsert('parcels', p.id, p);
  }, []);

  const saveEntry = useCallback(
    async (e: LogEntry) => {
      await store.put('entries', e);
      upsert('entries', e.id, e);
      completeTask('logEntry');
    },
    [completeTask],
  );

  const savePhoto = useCallback(async (p: PhotoMeta) => {
    await store.put('photos', p);
    upsert('photos', p.id, p);
  }, []);

  const deletePhoto = useCallback(async (id: string) => {
    await store.remove('photos', id);
    setData((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }));
  }, []);

  const saveChecklist = useCallback(async (c: ChecklistState) => {
    await store.put('checklists', c);
    upsert('checklists', c.parcelId, c);
  }, []);

  const saveReport = useCallback(
    async (r: SavedReport) => {
      await store.put('reports', r);
      upsert('reports', r.id, r);
      completeTask('buildReport');
    },
    [completeTask],
  );

  // Deletes return an undo function so the UI can offer "Undo" in a toast.
  const deleteEntry = useCallback(
    async (id: string) => {
      const entry = data.entries.find((e) => e.id === id);
      const photos = data.photos.filter((p) => entry?.photoIds.includes(p.id));
      await store.remove('entries', id);
      await Promise.all(photos.map((p) => store.remove('photos', p.id)));
      setData((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id), photos: d.photos.filter((p) => !photos.includes(p)) }));
      return async () => {
        if (!entry) return;
        await Promise.all(photos.map((p) => store.put('photos', p)));
        await store.put('entries', entry);
        setData((d) => ({ ...d, entries: [...d.entries, entry], photos: [...d.photos, ...photos] }));
      };
    },
    [data.entries, data.photos],
  );

  const deleteParcel = useCallback(
    async (id: string) => {
      const parcel = data.parcels.find((p) => p.id === id);
      const entries = data.entries.filter((e) => e.parcelId === id);
      const photoIds = new Set(entries.flatMap((e) => e.photoIds));
      const photos = data.photos.filter((p) => photoIds.has(p.id) || p.parcelId === id);
      await store.remove('parcels', id);
      await Promise.all([...entries.map((e) => store.remove('entries', e.id)), ...photos.map((p) => store.remove('photos', p.id))]);
      setData((d) => ({
        ...d,
        parcels: d.parcels.filter((p) => p.id !== id),
        entries: d.entries.filter((e) => e.parcelId !== id),
        photos: d.photos.filter((p) => !photos.includes(p)),
      }));
      return async () => {
        if (!parcel) return;
        await store.put('parcels', parcel);
        await Promise.all([...entries.map((e) => store.put('entries', e)), ...photos.map((p) => store.put('photos', p))]);
        setData((d) => ({ ...d, parcels: [...d.parcels, parcel], entries: [...d.entries, ...entries], photos: [...d.photos, ...photos] }));
      };
    },
    [data],
  );

  const deleteReport = useCallback(
    async (id: string) => {
      const r = data.reports.find((x) => x.id === id);
      await store.remove('reports', id);
      setData((d) => ({ ...d, reports: d.reports.filter((x) => x.id !== id) }));
      return async () => {
        if (!r) return;
        await store.put('reports', r);
        setData((d) => ({ ...d, reports: [...d.reports, r] }));
      };
    },
    [data.reports],
  );

  const replaceAll = useCallback(async (s: store.Snapshot) => {
    await store.clearFarmData();
    await store.writeSnapshot(s);
    setData(s);
  }, []);

  const loadDemo = useCallback(async () => {
    const snap = await buildDemoSnapshot();
    await replaceAll(snap);
    completeTask('openDemo');
  }, [replaceAll, completeTask]);

  const resetAll = useCallback(async () => {
    await store.clearFarmData();
    setData(EMPTY);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      status,
      settings,
      data,
      farm: data.farms[0],
      lang,
      t,
      updateSettings,
      completeTask,
      saveFarm,
      saveParcel,
      deleteParcel,
      saveEntry,
      deleteEntry,
      savePhoto,
      deletePhoto,
      saveChecklist,
      saveReport,
      deleteReport,
      replaceAll,
      loadDemo,
      resetAll,
    }),
    [status, settings, data, lang, t, updateSettings, completeTask, saveFarm, saveParcel, deleteParcel, saveEntry, deleteEntry, savePhoto, deletePhoto, saveChecklist, saveReport, deleteReport, replaceAll, loadDemo, resetAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
