// Farmer profiles on one device. Each profile has its own IndexedDB database, so
// one farmer's farm, meadows, log and photos are never loaded for another farmer.
// Nothing leaves the device. The optional PIN only keeps other people on the same
// device out of a profile; it is a lock, not encryption.

export interface Profile {
  id: string;
  name: string;
  /** SHA-256 of salt + PIN, hex. */
  pinHash?: string;
  salt?: string;
  createdAt: string;
}

const LIST_KEY = 'ga-profiles';
const ACTIVE_KEY = 'ga-active-profile';
const UNLOCKED_KEY = 'ga-unlocked';
const PICKER_KEY = 'ga-show-picker';
export const DEFAULT_PROFILE = 'default';
export const BASE_DB_NAME = 'grassland-assistant';

function read(key: string, store: 'local' | 'session' = 'local'): string | null {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null, store: 'local' | 'session' = 'local'): void {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage blocked: profiles fall back to the single default one */
  }
}

/** All profiles on this device. There is always at least the default one. */
export function listProfiles(): Profile[] {
  let list: Profile[] = [];
  try {
    const raw = JSON.parse(read(LIST_KEY) ?? '[]');
    if (Array.isArray(raw)) list = raw.filter((p) => p && typeof p.id === 'string');
  } catch {
    list = [];
  }
  if (!list.some((p) => p.id === DEFAULT_PROFILE)) list.unshift({ id: DEFAULT_PROFILE, name: '', createdAt: '' });
  return list;
}

function saveList(list: Profile[]): void {
  write(LIST_KEY, JSON.stringify(list));
}

export function activeProfileId(): string {
  const id = read(ACTIVE_KEY);
  return id && listProfiles().some((p) => p.id === id) ? id : DEFAULT_PROFILE;
}

export function activeProfile(): Profile {
  const id = activeProfileId();
  return listProfiles().find((p) => p.id === id)!;
}

/** The IndexedDB database that holds one profile's data. The first profile keeps the original name, so existing data stays. */
export function dbNameFor(id: string): string {
  return id === DEFAULT_PROFILE ? BASE_DB_NAME : `${BASE_DB_NAME}--${id}`;
}

/** Show "Who is using the app?" before any farm data is loaded. */
export function needsPicker(): boolean {
  if (read(PICKER_KEY, 'session')) return true;
  const list = listProfiles();
  const active = list.find((p) => p.id === activeProfileId());
  if (read(UNLOCKED_KEY, 'session') === activeProfileId()) return false;
  return list.length > 1 || !!active?.pinHash;
}

async function hash(pin: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newSalt(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function checkPin(p: Profile, pin: string): Promise<boolean> {
  if (!p.pinHash || !p.salt) return true;
  return (await hash(pin, p.salt)) === p.pinHash;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export async function createProfile(name: string, pin?: string): Promise<Profile> {
  const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const p: Profile = { id, name: name.trim(), createdAt: new Date().toISOString() };
  if (pin) {
    p.salt = newSalt();
    p.pinHash = await hash(pin, p.salt);
  }
  saveList([...listProfiles(), p]);
  return p;
}

export function renameProfile(id: string, name: string): void {
  saveList(listProfiles().map((p) => (p.id === id ? { ...p, name: name.trim() } : p)));
}

/** Set, change or (with an empty pin) remove a profile's PIN. */
export async function setPin(id: string, pin: string): Promise<void> {
  const list = listProfiles();
  const next = await Promise.all(
    list.map(async (p) => {
      if (p.id !== id) return p;
      if (!pin) return { ...p, pinHash: undefined, salt: undefined };
      const salt = newSalt();
      return { ...p, salt, pinHash: await hash(pin, salt) };
    }),
  );
  saveList(next);
}

/** Open a profile: it becomes active and unlocked for this browser session, then the app reloads with its data. */
export function openProfile(id: string): void {
  write(ACTIVE_KEY, id);
  write(UNLOCKED_KEY, id, 'session');
  write(PICKER_KEY, null, 'session');
  write('ga-setup-draft', null, 'session');
  window.location.reload();
}

/** Close the current profile and show the profile picker. */
export function switchProfile(): void {
  write(UNLOCKED_KEY, null, 'session');
  write(PICKER_KEY, '1', 'session');
  write('ga-setup-draft', null, 'session');
  window.location.reload();
}

/** Delete a profile and all of its data on this device. */
export async function deleteProfile(id: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbNameFor(id));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  if (id === DEFAULT_PROFILE) {
    // the default profile cannot disappear; it starts again empty
    saveList(listProfiles().map((p) => (p.id === id ? { id, name: '', createdAt: '' } : p)));
  } else {
    saveList(listProfiles().filter((p) => p.id !== id));
  }
  if (read(ACTIVE_KEY) === id) write(ACTIVE_KEY, null);
}

/** Remember the language for the profile picker, which runs before any profile is opened. */
export function rememberLang(lang: string): void {
  write('ga-last-lang', lang);
}

export function pickerLang(): 'et' | 'en' {
  const l = read('ga-last-lang');
  if (l === 'et' || l === 'en') return l;
  return navigator.language?.toLowerCase().startsWith('et') ? 'et' : 'en';
}
