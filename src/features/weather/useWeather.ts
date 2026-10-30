import { useCallback, useEffect, useRef, useState } from 'react';
import { cacheWeather, cachedWeather } from '../../services/db';
import { weatherService } from '../../services';
import { WeatherError, type WeatherBaseline, type WeatherSeries } from '../../services/weather';

export type WeatherState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; series: WeatherSeries };

export function useWeather(lat: number | undefined, lon: number | undefined, start: string, end: string, enabled = true, baselineRange?: { start: string; end: string }) {
  const bStart = baselineRange?.start ?? start;
  const bEnd = baselineRange?.end ?? end;
  const [state, setState] = useState<WeatherState>({ status: 'idle' });
  const [baseline, setBaseline] = useState<{ status: 'idle' | 'loading' | 'error' | 'ready'; data?: WeatherBaseline }>({ status: 'idle' });
  const [nonce, setNonce] = useState(0);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || lat === undefined || lon === undefined || !start || !end) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}:${start}:${end}`;
    setState({ status: 'loading' });
    setBaseline({ status: 'loading' });
    (async () => {
      try {
        const series = (await cachedWeather(key).catch(() => null)) ?? (await weatherService.getDaily(lat, lon, start, end, c.signal));
        if (c.signal.aborted) return;
        setState({ status: 'ready', series });
        void cacheWeather(key, series).catch(() => {});
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setState({ status: 'error', message: e instanceof WeatherError ? e.message : String((e as Error).message ?? e) });
        setBaseline({ status: 'idle' });
        return;
      }
      try {
        const bkey = `baseline:${lat.toFixed(2)},${lon.toFixed(2)}:${bStart.slice(5)}:${bEnd.slice(5)}`;
        const cached = sessionStorageGet<WeatherBaseline>(bkey);
        const data = cached ?? (await weatherService.getBaseline(lat, lon, bStart, bEnd, c.signal));
        if (c.signal.aborted) return;
        sessionStorageSet(bkey, data);
        setBaseline({ status: 'ready', data });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setBaseline({ status: 'error' });
      }
    })();
    return () => c.abort();
  }, [lat, lon, start, end, enabled, nonce, bStart, bEnd]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { state, baseline, retry };
}

function sessionStorageGet<T>(k: string): T | null {
  try {
    const v = sessionStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function sessionStorageSet(k: string, v: unknown) {
  try {
    sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: the comparison simply reloads next time */
  }
}
