import { describe, expect, it } from 'vitest';
import { candidatesFromFile, candidatesFromGeoJSON } from './fileImport';

// cadastral unit 19502:002:0104 in L-EST97 metres (as the Land Board serves it)
const LEST = { type: 'Polygon', coordinates: [[[488669.44, 6496290.86], [488642.84, 6495741.55], [488932.04, 6495656.35], [488983.24, 6496372.53], [488669.44, 6496290.86]]] };
const file = (name: string, body: unknown) => new File([typeof body === 'string' ? body : JSON.stringify(body)], name);

describe('file import', () => {
  it('converts an Estonian L-EST97 GeoJSON outline and computes its area', () => {
    const [c] = candidatesFromGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nimi: 'Männiku' }, geometry: LEST }] }, 'plots');
    expect(c.label).toBe('Männiku');
    expect(c.lat).toBeCloseTo(58.604, 2);
    expect(c.lon).toBeCloseTo(23.807, 2);
    expect(c.areaHa).toBeGreaterThan(18);
    expect(c.areaHa).toBeLessThan(20.5); // the cadastre records 19.08 ha
  });
  it('reads a .geojson file and names unnamed shapes after the file', async () => {
    const found = await candidatesFromFile(file('farm.geojson', { type: 'Feature', properties: null, geometry: LEST }));
    expect(found).toHaveLength(1);
    expect(found[0].label).toBe('farm #1');
  });
  it('rejects files without polygons, unreadable files and shapes outside Estonia', async () => {
    await expect(candidatesFromFile(file('points.geojson', { type: 'Point', coordinates: [23.8, 58.6] }))).rejects.toMatchObject({ message: 'fileNoShapes' });
    await expect(candidatesFromFile(file('broken.geojson', '{ not json'))).rejects.toMatchObject({ message: 'fileUnreadable' });
    const paris = { type: 'Polygon', coordinates: [[[2.3, 48.8], [2.4, 48.8], [2.4, 48.9], [2.3, 48.8]]] };
    await expect(candidatesFromFile(file('paris.json', paris))).rejects.toMatchObject({ message: 'fileOutsideEstonia' });
  });
});
