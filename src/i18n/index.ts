import { en, type Messages } from './en';
import { et } from './et';
import type { Lang } from '../lib/types';

export const messages: Record<Lang, Messages> = { en, et };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string ? never : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>> }[keyof T & string];
export type MessageKey = Paths<Messages>;

export type Vars = Record<string, string | number>;

export function lookup(lang: Lang, key: string): string | undefined {
  let node: unknown = messages[lang];
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as object)) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(lang: Lang, key: MessageKey | string, vars?: Vars): string {
  const raw = lookup(lang, key) ?? lookup('en', key) ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : raw;
}

/** Flatten a messages tree into dotted keys (used by the translation completeness test). */
export function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
}
