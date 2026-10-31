// What the living meadow shows. Pages publish the weather of whatever window the
// user is looking at (dashboard brush, report period, weather query); the canvas
// reads it. No data → a calm default, never invented weather.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import type { WeatherDay } from '../../services/weather';

export interface MeadowConditions {
  /** Mean of daily max wind in the window, km/h. */
  windKmh: number;
  /** Mean relative humidity, %. */
  humidity: number;
  /** Mean daily rain in the window, mm. */
  rainMm: number;
  /** Share of days with ≥1 mm. */
  wetShare: number;
  /** True when these come from real data (false = calm default). */
  fromData: boolean;
}

export const CALM: MeadowConditions = { windKmh: 12, humidity: 70, rainMm: 0, wetShare: 0, fromData: false };

export function conditionsFromDays(days: WeatherDay[]): MeadowConditions {
  const mean = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const rain = days.filter((d) => d.precipitationMm !== null);
  if (!days.length || !rain.length) return CALM;
  return {
    windKmh: mean(days.map((d) => d.windMaxKmh)) ?? CALM.windKmh,
    humidity: mean(days.map((d) => d.humidityPct)) ?? CALM.humidity,
    rainMm: mean(rain.map((d) => d.precipitationMm)) ?? 0,
    wetShare: rain.filter((d) => (d.precipitationMm ?? 0) >= 1).length / rain.length,
    fromData: true,
  };
}

interface Ctx {
  conditions: MeadowConditions;
  publish: (c: MeadowConditions | null) => void;
  /** Effects off (setting or OS reduced-motion): the meadow renders one still frame. */
  reduced: boolean;
}

const MeadowCtx = createContext<Ctx>({ conditions: CALM, publish: () => {}, reduced: true });

export function MeadowProvider({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  const [conditions, setConditions] = useState<MeadowConditions>(CALM);
  const [osReduced, setOsReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const on = () => setOsReduced(mq.matches);
    mq?.addEventListener('change', on);
    return () => mq?.removeEventListener('change', on);
  }, []);
  const publish = useCallback((c: MeadowConditions | null) => setConditions(c ?? CALM), []);
  // ?effects=reduced in the URL forces the low-power mode (handy for shared links and audits)
  const [urlReduced] = useState(() => new URLSearchParams(window.location.search).get('effects') === 'reduced');
  const value = useMemo(() => ({ conditions, publish, reduced: settings.effects === 'reduced' || osReduced || urlReduced }), [conditions, publish, settings.effects, osReduced, urlReduced]);
  return <MeadowCtx.Provider value={value}>{children}</MeadowCtx.Provider>;
}

export const useMeadow = () => useContext(MeadowCtx);

/** Publish a weather window to the meadow while the calling page is mounted. */
export function useMeadowWindow(days: WeatherDay[] | null | undefined) {
  const { publish } = useMeadow();
  useEffect(() => {
    publish(days && days.length ? conditionsFromDays(days) : null);
  }, [days, publish]);
  useEffect(() => () => publish(null), [publish]);
}
