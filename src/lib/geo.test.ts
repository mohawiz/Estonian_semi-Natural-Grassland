import { describe, expect, it } from 'vitest';
import fixture from '../services/fixtures/pria-plk-ala.json';
import { areaHa, centre, contains, lest97ToWgs84, toWgs84, type Boundary } from './geo';

const pria = fixture.features[0];

describe('geo', () => {
  it('converts L-EST97 to WGS 84 like the Land Board service does', () => {
    // first vertex of cadastral unit 19502:002:0104, as served in both systems
    const [lon, lat] = lest97ToWgs84(488669.44, 6496290.86);
    expect(lon).toBeCloseTo(23.80506862, 6);
    expect(lat).toBeCloseTo(58.60639789, 6);
  });

  it("computes a PRIA meadow's area close to PRIA's own figure", () => {
    expect(areaHa(pria.geometry as Boundary)).toBeCloseTo(pria.properties.pindala_ha, 1);
  });

  it('puts the weather point inside the field', () => {
    const b = pria.geometry as Boundary;
    expect(contains(b, centre(b))).toBe(true);
  });

  it('converts a whole boundary only when it is in L-EST97', () => {
    const lest: Boundary = { type: 'Polygon', coordinates: [[[488669.44, 6496290.86], [488642.84, 6495741.55], [488932.04, 6495656.35], [488669.44, 6496290.86]]] };
    const w = toWgs84(lest);
    expect(w.coordinates[0][0][1]).toBeCloseTo(58.6064, 3);
    const deg = pria.geometry as Boundary;
    expect(toWgs84(deg)).toBe(deg);
  });
});
