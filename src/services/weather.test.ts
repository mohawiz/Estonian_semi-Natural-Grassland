import { describe, expect, it, vi } from 'vitest';
import { computeBaseline, getWeatherJSON, parseOpenMeteoDaily, summarizeWeather, todayInTallinn, WeatherError, type WeatherDay } from './weather';

const day = (date: string, p: number | null, soil: number | null = null): WeatherDay => ({ date, precipitationMm: p, tMaxC: 18, tMinC: 10, soilMoisture: soil });

describe('summarizeWeather', () => {
  it('counts wet, heavy days and spells', () => {
    const s = summarizeWeather([day('2026-07-01', 0), day('2026-07-02', 12), day('2026-07-03', 3), day('2026-07-04', 0.2), day('2026-07-05', 15, 0.4)]);
    expect(s.totalPrecipMm).toBe(30.2);
    expect(s.wetDays).toBe(3);
    expect(s.heavyRainDays).toBe(2);
    expect(s.longestWetSpell).toBe(2);
    expect(s.longestDrySpell).toBe(1);
    expect(s.maxDailyDate).toBe('2026-07-05');
    expect(s.meanSoilMoisture).toBe(0.4);
  });
  it('treats missing values as gaps, not zeros', () => {
    const s = summarizeWeather([day('2026-07-01', null), day('2026-07-02', 5)]);
    expect(s.daysWithData).toBe(1);
  });
  it('ignores zero soil moisture (sea grid cells)', () => {
    expect(summarizeWeather([day('2026-07-01', 1, 0)]).meanSoilMoisture).toBeNull();
  });
});

describe('Open-Meteo parsing', () => {
  it('maps the daily arrays', () => {
    const s = parseOpenMeteoDaily({ latitude: 58.73, longitude: 23.85, daily: { time: ['2026-07-01'], precipitation_sum: [1.4], temperature_2m_max: [20], temperature_2m_min: [10], soil_moisture_0_to_7cm_mean: [0.3] } }, 58.7346, 23.853, '2026-07-01', '2026-07-01');
    expect(s.days[0]).toEqual({ date: '2026-07-01', precipitationMm: 1.4, tMaxC: 20, tMinC: 10, soilMoisture: 0.3, windMaxKmh: null, humidityPct: null });
    expect(s.source.licence).toMatch(/CC BY 4.0/);
  });
  it('refuses empty data instead of inventing it', () => {
    expect(() => parseOpenMeteoDaily({ daily: { time: [] } }, 0, 0, 'a', 'b')).toThrow(WeatherError);
    expect(() => parseOpenMeteoDaily({ daily: { time: ['2026-07-01'], precipitation_sum: [null], temperature_2m_max: [null] } }, 0, 0, 'a', 'b')).toThrow(WeatherError);
  });
});

describe('baseline', () => {
  it('averages the same calendar window across years', () => {
    const times = ['2001-06-30', '2001-07-01', '2001-07-02', '2002-07-01', '2002-07-02', '2002-07-03'];
    const vals = [100, 2, 4, 10, 0, 50];
    const b = computeBaseline(times, vals, '2026-07-01', '2026-07-02', [2001, 2002]);
    expect(b.perYearTotals).toEqual([{ year: 2001, totalMm: 6 }, { year: 2002, totalMm: 10 }]);
    expect(b.meanTotalMm).toBe(8);
  });
});

describe('getWeatherJSON', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('retries server errors and rate limits, then succeeds', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValueOnce(json(503, {})).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json(200, { ok: 1 }));
    const p = getWeatherJSON('u', undefined, f as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('does not retry a bad request and shows the service reason', async () => {
    const f = vi.fn().mockResolvedValue(json(400, { error: true, reason: 'Parameter out of range' }));
    await expect(getWeatherJSON('u', undefined, f as unknown as typeof fetch)).rejects.toThrow('Parameter out of range (HTTP 400)');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('gives a plain message after repeated outages', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValue(json(502, {}));
    const p = getWeatherJSON('u', undefined, f as unknown as typeof fetch).catch((e) => e);
    await vi.runAllTimersAsync();
    const e = await p;
    expect(e).toBeInstanceOf(WeatherError);
    expect(e.message).toContain('temporary problem');
    expect(f).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe('todayInTallinn', () => {
  it('uses Estonian time, not UTC', () => {
    expect(todayInTallinn(new Date('2026-07-31T22:30:00Z'))).toBe('2026-08-01');
  });
});
