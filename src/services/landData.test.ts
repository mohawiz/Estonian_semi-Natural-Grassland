import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/pria-plk-ala.json';
import { candidateToParcelFields, communityFromHabitat, estonianDate, findByMeadowNo, LandDataError, normalizeCadastralId, normalizeMeadowNo } from './landData';

afterEach(() => vi.unstubAllGlobals());

describe('landData helpers', () => {
  it('reads PRIA dates as Estonian calendar dates', () => {
    expect(estonianDate('2026-05-30T21:00:00Z')).toBe('2026-05-31');
    expect(estonianDate('2026-07-14T21:00:00Z')).toBe('2026-07-15');
    expect(estonianDate(null)).toBeUndefined();
  });
  it('accepts cadastral ids typed with spaces or without colons', () => {
    expect(normalizeCadastralId('19502:002:0104')).toBe('19502:002:0104');
    expect(normalizeCadastralId('19502 002 0104')).toBe('19502:002:0104');
    expect(normalizeCadastralId('195020020104')).toBe('19502:002:0104');
    expect(normalizeCadastralId('1950200201')).toBeNull();
  });
  it('accepts meadow numbers with spaces', () => {
    expect(normalizeMeadowNo('4825 0239 357')).toBe('48250239357');
    expect(normalizeMeadowNo('abc')).toBeNull();
  });
  it('maps habitat codes to community types', () => {
    expect(communityFromHabitat('1630*')).toBe('coastal-meadow');
    expect(communityFromHabitat('6530*')).toBe('wooded-meadow');
    expect(communityFromHabitat('6280*')).toBe('alvar');
    expect(communityFromHabitat('9999')).toBe('other');
  });
});

describe('findByMeadowNo', () => {
  it("turns PRIA's record into plot fields", async () => {
    const eelis = { features: [{ geometry: fixture.features[0].geometry, properties: { pohityyp: '6210', rannaala: 'Ei' } }] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('pria') ? fixture : eelis))));
    const [c] = await findByMeadowNo('48250239357');
    expect(c.source).toBe('pria');
    expect(c.areaHa).toBe(6.83);
    expect(c.plannedMethod).toBe('grazing'); // hooldamise_vote K
    expect(c.communityType).toBe('dry-meadow');
    const fields = candidateToParcelFields(c, '2026-11-09T00:00:00Z');
    expect(fields.code).toBe('48250239357');
    expect(fields.source).toEqual({ kind: 'pria', ref: '48250239357/324984', fetchedAt: '2026-11-09T00:00:00Z' });
    expect(fields.boundary?.type).toBe('Polygon');
  });
  it('says clearly when a number is not in the register', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ features: [] }))));
    await expect(findByMeadowNo('123456789')).rejects.toMatchObject({ code: 'not-found' });
  });
  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(findByMeadowNo('48250239357')).rejects.toBeInstanceOf(LandDataError);
  });
});

describe('area labels', () => {
  it('shows short codes but hides free text that may be a name', async () => {
    const { safeAreaLabel } = await import('./landData');
    expect(safeAreaLabel('1')).toBe('1');
    expect(safeAreaLabel('2e')).toBe('2E');
    expect(safeAreaLabel('DIANA PURGA')).toBeUndefined();
    expect(safeAreaLabel('ULE JOE UUS 3')).toBeUndefined();
  });
});
