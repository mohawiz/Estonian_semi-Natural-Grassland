import { describe, expect, it } from 'vitest';
import { ACRES_PER_HECTARE, acresToHa, formatArea, haToAcres } from './units';

describe('area conversion', () => {
  it('uses the international acre (1 ha = 2.4710538 ac)', () => {
    expect(ACRES_PER_HECTARE).toBeCloseTo(2.4710538, 6);
    expect(haToAcres(1)).toBeCloseTo(2.4710538, 6);
    expect(acresToHa(1)).toBeCloseTo(0.4046856, 6);
  });
  it('round-trips', () => {
    for (const ha of [0, 0.1, 6.8, 12.4, 700]) expect(acresToHa(haToAcres(ha))).toBeCloseTo(ha, 9);
  });
  it("covers Marika's 600–800 figure both ways", () => {
    expect(acresToHa(600)).toBeCloseTo(242.81, 2);
    expect(haToAcres(800)).toBeCloseTo(1976.84, 2);
  });
  it('always shows hectares and acres, localised', () => {
    expect(formatArea(12.4, 'en')).toBe('12.4 ha (30.64 ac)');
    expect(formatArea(12.4, 'et')).toBe('12,4 ha (30,64 ac)');
    expect(formatArea(NaN, 'en')).toBe('—');
  });
});
