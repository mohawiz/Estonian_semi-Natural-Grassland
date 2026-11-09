// Which official sources changed since the library was last reviewed. The
// backend re-checks them daily (backend/app/source_check.py); without a backend
// the app shows no flags.
import { useEffect, useState } from 'react';
import { apiBaseUrl } from '.';

export interface SourceStatus {
  status: 'unchanged' | 'new-version' | 'changed' | 'page-updated' | 'unreachable' | 'new';
  needsReview: boolean;
  missing: string[];
  version: string | null;
  error: string | null;
}

export interface LibraryStatus {
  checkedAt: string | null;
  documents: Record<string, SourceStatus>;
}

export async function fetchLibraryStatus(base: string, signal?: AbortSignal): Promise<LibraryStatus | null> {
  try {
    const res = await fetch(`${base}/api/library/status`, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as LibraryStatus;
    return json && typeof json === 'object' && json.documents ? json : null;
  } catch {
    return null; // the backend may be asleep: the library simply shows no flags
  }
}

export function useLibraryStatus(): LibraryStatus | null {
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  useEffect(() => {
    if (!apiBaseUrl) return;
    const c = new AbortController();
    void fetchLibraryStatus(apiBaseUrl, c.signal).then((s) => !c.signal.aborted && setStatus(s));
    return () => c.abort();
  }, []);
  return status;
}
