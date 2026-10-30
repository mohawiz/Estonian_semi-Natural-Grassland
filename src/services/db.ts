// All farmer data lives in this browser's IndexedDB. Nothing is sent anywhere
// except coordinates + dates to the weather API when the user asks for weather.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ChecklistState, Farm, LogEntry, Parcel, PhotoMeta, SavedReport, Settings } from '../lib/types';
import type { WeatherSeries } from './weather';

interface GrasslandDB extends DBSchema {
  farms: { key: string; value: Farm };
  parcels: { key: string; value: Parcel; indexes: { byFarm: string } };
  entries: { key: string; value: LogEntry; indexes: { byParcel: string } };
  photos: { key: string; value: PhotoMeta };
  checklists: { key: string; value: ChecklistState };
  reports: { key: string; value: SavedReport };
  settings: { key: string; value: Settings };
  weatherCache: { key: string; value: { key: string; series: WeatherSeries; storedAt: number } };
}

export const DB_NAME = 'grassland-assistant';
let dbPromise: Promise<IDBPDatabase<GrasslandDB>> | null = null;

export function db(): Promise<IDBPDatabase<GrasslandDB>> {
  dbPromise ??= openDB<GrasslandDB>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('farms', { keyPath: 'id' });
      d.createObjectStore('parcels', { keyPath: 'id' }).createIndex('byFarm', 'farmId');
      d.createObjectStore('entries', { keyPath: 'id' }).createIndex('byParcel', 'parcelId');
      d.createObjectStore('photos', { keyPath: 'id' });
      d.createObjectStore('checklists', { keyPath: 'parcelId' });
      d.createObjectStore('reports', { keyPath: 'id' });
      d.createObjectStore('settings');
      d.createObjectStore('weatherCache', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'et',
  theme: 'system',
  welcomeDone: false,
  tourDone: false,
  noticeWorkingDays: 15,
  onboarding: { openDemo: false, logEntry: false, buildReport: false, askAssistant: false },
};

export async function loadSettings(): Promise<Settings> {
  const s = await (await db()).get('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...s, onboarding: { ...DEFAULT_SETTINGS.onboarding, ...s?.onboarding } };
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await db()).put('settings', s, 'app');
}

export interface Snapshot {
  farms: Farm[];
  parcels: Parcel[];
  entries: LogEntry[];
  photos: PhotoMeta[];
  checklists: ChecklistState[];
  reports: SavedReport[];
}

export async function loadAll(): Promise<Snapshot> {
  const d = await db();
  const [farms, parcels, entries, photos, checklists, reports] = await Promise.all([
    d.getAll('farms'),
    d.getAll('parcels'),
    d.getAll('entries'),
    d.getAll('photos'),
    d.getAll('checklists'),
    d.getAll('reports'),
  ]);
  return { farms, parcels, entries, photos, checklists, reports };
}

type DataStore = 'farms' | 'parcels' | 'entries' | 'photos' | 'checklists' | 'reports';

export async function put<S extends DataStore>(store: S, value: GrasslandDB[S]['value']): Promise<void> {
  await (await db()).put(store, value as never);
}

export async function remove(store: DataStore, key: string): Promise<void> {
  await (await db()).delete(store, key);
}

export async function clearFarmData(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['farms', 'parcels', 'entries', 'photos', 'checklists', 'reports'], 'readwrite');
  await Promise.all([
    tx.objectStore('farms').clear(),
    tx.objectStore('parcels').clear(),
    tx.objectStore('entries').clear(),
    tx.objectStore('photos').clear(),
    tx.objectStore('checklists').clear(),
    tx.objectStore('reports').clear(),
    tx.done,
  ]);
}

export async function writeSnapshot(s: Snapshot): Promise<void> {
  const d = await db();
  const tx = d.transaction(['farms', 'parcels', 'entries', 'photos', 'checklists', 'reports'], 'readwrite');
  const ops: Promise<unknown>[] = [];
  s.farms.forEach((x) => ops.push(tx.objectStore('farms').put(x)));
  s.parcels.forEach((x) => ops.push(tx.objectStore('parcels').put(x)));
  s.entries.forEach((x) => ops.push(tx.objectStore('entries').put(x)));
  s.photos.forEach((x) => ops.push(tx.objectStore('photos').put(x)));
  s.checklists.forEach((x) => ops.push(tx.objectStore('checklists').put(x)));
  s.reports.forEach((x) => ops.push(tx.objectStore('reports').put(x)));
  await Promise.all([...ops, tx.done]);
}

const WEATHER_TTL = 1000 * 60 * 60 * 24 * 7;

export async function cachedWeather(key: string): Promise<WeatherSeries | null> {
  const hit = await (await db()).get('weatherCache', key);
  return hit && Date.now() - hit.storedAt < WEATHER_TTL ? hit.series : null;
}

export async function cacheWeather(key: string, series: WeatherSeries): Promise<void> {
  await (await db()).put('weatherCache', { key, series, storedAt: Date.now() });
}
