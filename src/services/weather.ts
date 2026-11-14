// Weather evidence. The UI talks only to the WeatherService interface, so the
// Open-Meteo client can later be swapped for a backend (e.g. FastAPI proxying
// Estonian Environment Agency station data) without touching components.

export interface WeatherDay {
  date: string;
  precipitationMm: number | null;
  tMaxC: number | null;
  tMinC: number | null;
  /** Volumetric soil water content, 0–7 cm, m³/m³ (modelled). */
  soilMoisture: number | null;
  /** Daily maximum wind speed at 10 m, km/h. Drives the meadow's sway. */
  windMaxKmh?: number | null;
  /** Daily mean relative humidity at 2 m, %. Drives the meadow's mist. */
  humidityPct?: number | null;
}

export interface WeatherSeries {
  lat: number;
  lon: number;
  gridLat: number;
  gridLon: number;
  start: string;
  end: string;
  days: WeatherDay[];
  source: WeatherSource;
  fetchedAt: string;
}

export interface WeatherBaseline {
  /** Mean total precipitation for the same calendar window, per year. */
  meanTotalMm: number;
  years: [number, number];
  perYearTotals: { year: number; totalMm: number }[];
}

export interface WeatherSource {
  name: string;
  url: string;
  licence: string;
  note: string;
}

export interface WeatherService {
  getDaily(lat: number, lon: number, start: string, end: string, signal?: AbortSignal): Promise<WeatherSeries>;
  getBaseline(lat: number, lon: number, start: string, end: string, signal?: AbortSignal): Promise<WeatherBaseline>;
}

export class WeatherError extends Error {
  constructor(
    public code: 'network' | 'http' | 'no-data' | 'range',
    message: string,
  ) {
    super(message);
  }
}

export const OPEN_METEO_SOURCE: WeatherSource = {
  name: 'Open-Meteo Historical Weather API',
  url: 'https://open-meteo.com/en/docs/historical-weather-api',
  licence: 'CC BY 4.0 — weather data by Open-Meteo.com',
  note: 'Modelled reanalysis data (ECMWF ERA5 / ERA5-Land and others) on a grid of roughly 9–25 km, not station observations. The most recent ~5 days may be missing.',
};

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

const RETRY_DELAYS_MS = [800, 2500];

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/** Fetch JSON, retrying network failures, rate limits and server errors (the free service has short outages). */
async function getJSON(url: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetchImpl(url, { signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
    if (res?.ok) return res.json();
    const retriable = !res || res.status === 429 || res.status >= 500;
    if (retriable && attempt < RETRY_DELAYS_MS.length) {
      await wait(RETRY_DELAYS_MS[attempt], signal);
      continue;
    }
    if (!res) throw new WeatherError('network', 'Could not reach the weather service. Check your internet connection and try again.');
    let reason = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.reason) reason = `${body.reason} (HTTP ${res.status})`;
    } catch {
      /* body was not JSON */
    }
    if (res.status === 429) reason = `The weather service is busy (too many requests). Try again in a minute. (HTTP 429)`;
    else if (res.status >= 500) reason = `The weather service had a temporary problem. Try again in a minute. (HTTP ${res.status})`;
    throw new WeatherError('http', reason);
  }
}
export { getJSON as getWeatherJSON };

/** Today's date in Estonia (YYYY-MM-DD): the archive has no data after it. */
export function todayInTallinn(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn' }).format(now);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseOpenMeteoDaily(json: any, lat: number, lon: number, start: string, end: string): WeatherSeries {
  const d = json?.daily;
  if (!d?.time?.length) throw new WeatherError('no-data', 'The weather service returned no data for this place and period.');
  const days: WeatherDay[] = d.time.map((date: string, i: number) => ({
    date,
    precipitationMm: num(d.precipitation_sum?.[i]),
    tMaxC: num(d.temperature_2m_max?.[i]),
    tMinC: num(d.temperature_2m_min?.[i]),
    soilMoisture: num(d.soil_moisture_0_to_7cm_mean?.[i]),
    windMaxKmh: num(d.wind_speed_10m_max?.[i]),
    humidityPct: num(d.relative_humidity_2m_mean?.[i]),
  }));
  if (days.every((x) => x.precipitationMm === null && x.tMaxC === null)) {
    throw new WeatherError('no-data', 'The weather service has no values for this period yet.');
  }
  return {
    lat,
    lon,
    gridLat: json.latitude,
    gridLon: json.longitude,
    start,
    end,
    days,
    source: OPEN_METEO_SOURCE,
    fetchedAt: new Date().toISOString(),
  };
}

export class OpenMeteoWeatherService implements WeatherService {
  async getDaily(lat: number, lon: number, start: string, end: string, signal?: AbortSignal): Promise<WeatherSeries> {
    if (end < start) throw new WeatherError('range', 'The end date is before the start date.');
    const today = todayInTallinn();
    if (start > today) throw new WeatherError('range', 'This period is in the future, so there is no weather data for it yet.');
    if (end > today) end = today;
    const q = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      start_date: start,
      end_date: end,
      daily: 'precipitation_sum,temperature_2m_max,temperature_2m_min,soil_moisture_0_to_7cm_mean,wind_speed_10m_max,relative_humidity_2m_mean',
      timezone: 'Europe/Tallinn',
    });
    const json = await getJSON(`${ARCHIVE}?${q}`, signal);
    return parseOpenMeteoDaily(json, lat, lon, start, end);
  }

  async getBaseline(lat: number, lon: number, start: string, end: string, signal?: AbortSignal): Promise<WeatherBaseline> {
    const years: [number, number] = [1991, 2020];
    const q = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      start_date: `${years[0]}-01-01`,
      end_date: `${years[1]}-12-31`,
      daily: 'precipitation_sum',
      timezone: 'Europe/Tallinn',
    });
    const json = await getJSON(`${ARCHIVE}?${q}`, signal);
    return computeBaseline(json?.daily?.time ?? [], json?.daily?.precipitation_sum ?? [], start, end, years);
  }
}

/** Mean precipitation total over the same month-day window in each baseline year. */
export function computeBaseline(times: string[], values: (number | null)[], start: string, end: string, years: [number, number]): WeatherBaseline {
  const from = start.slice(5);
  const to = end.slice(5);
  const wraps = to < from;
  const totals = new Map<number, number>();
  times.forEach((t, i) => {
    const md = t.slice(5);
    const inWindow = wraps ? md >= from || md <= to : md >= from && md <= to;
    if (!inWindow) return;
    let y = Number(t.slice(0, 4));
    if (wraps && md <= to) y -= 1;
    if (y < years[0] || y > years[1]) return;
    totals.set(y, (totals.get(y) ?? 0) + (values[i] ?? 0));
  });
  const perYearTotals = [...totals.entries()].map(([year, totalMm]) => ({ year, totalMm })).sort((a, b) => a.year - b.year);
  if (!perYearTotals.length) throw new WeatherError('no-data', 'No baseline data for this window.');
  const meanTotalMm = perYearTotals.reduce((s, x) => s + x.totalMm, 0) / perYearTotals.length;
  return { meanTotalMm, years, perYearTotals };
}

export interface WeatherSummary {
  days: number;
  daysWithData: number;
  totalPrecipMm: number;
  wetDays: number; // ≥ 1 mm
  heavyRainDays: number; // ≥ 10 mm
  maxDailyMm: number;
  maxDailyDate: string | null;
  longestWetSpell: number; // consecutive days ≥ 1 mm
  longestDrySpell: number; // consecutive days < 1 mm
  meanTMax: number | null;
  meanSoilMoisture: number | null;
  maxSoilMoisture: number | null;
  baselineRatio: number | null;
}

export const WET_DAY_MM = 1;
export const HEAVY_DAY_MM = 10;

export function summarizeWeather(days: WeatherDay[], baseline?: WeatherBaseline | null): WeatherSummary {
  let total = 0;
  let wet = 0;
  let heavy = 0;
  let max = 0;
  let maxDate: string | null = null;
  let wetRun = 0;
  let dryRun = 0;
  let longestWet = 0;
  let longestDry = 0;
  let withData = 0;
  const tmax: number[] = [];
  const soil: number[] = [];
  for (const d of days) {
    if (d.tMaxC !== null) tmax.push(d.tMaxC);
    if (d.soilMoisture !== null && d.soilMoisture > 0) soil.push(d.soilMoisture);
    if (d.precipitationMm === null) {
      wetRun = 0;
      dryRun = 0;
      continue;
    }
    withData++;
    const p = d.precipitationMm;
    total += p;
    if (p > max) {
      max = p;
      maxDate = d.date;
    }
    if (p >= HEAVY_DAY_MM) heavy++;
    if (p >= WET_DAY_MM) {
      wet++;
      wetRun++;
      dryRun = 0;
    } else {
      dryRun++;
      wetRun = 0;
    }
    longestWet = Math.max(longestWet, wetRun);
    longestDry = Math.max(longestDry, dryRun);
  }
  const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  return {
    days: days.length,
    daysWithData: withData,
    totalPrecipMm: Math.round(total * 10) / 10,
    wetDays: wet,
    heavyRainDays: heavy,
    maxDailyMm: max,
    maxDailyDate: maxDate,
    longestWetSpell: longestWet,
    longestDrySpell: longestDry,
    meanTMax: mean(tmax),
    meanSoilMoisture: mean(soil),
    maxSoilMoisture: soil.length ? Math.max(...soil) : null,
    baselineRatio: baseline && baseline.meanTotalMm > 0 ? total / baseline.meanTotalMm : null,
  };
}

/** Today's weather at a plot, for the dashboard's Today card (Open-Meteo forecast, no key). */
export interface TodayWeather {
  date: string;
  tempNowC: number | null;
  tMaxC: number | null;
  tMinC: number | null;
  rainMm: number | null;
  rainChancePct: number | null;
  windKmh: number | null;
}

const FORECAST = 'https://api.open-meteo.com/v1/forecast';

export function parseTodayWeather(json: any): TodayWeather {
  const d = json?.daily ?? {};
  const first = (k: string) => num(Array.isArray(d[k]) ? d[k][0] : undefined);
  return {
    date: (Array.isArray(d.time) && d.time[0]) || todayInTallinn(),
    tempNowC: num(json?.current?.temperature_2m),
    tMaxC: first('temperature_2m_max'),
    tMinC: first('temperature_2m_min'),
    rainMm: first('precipitation_sum'),
    rainChancePct: first('precipitation_probability_max'),
    windKmh: num(json?.current?.wind_speed_10m),
  };
}

export async function getTodayWeather(lat: number, lon: number, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<TodayWeather> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
    timezone: 'Europe/Tallinn',
    forecast_days: '1',
  });
  return parseTodayWeather(await getJSON(`${FORECAST}?${q}`, signal, fetchImpl));
}
