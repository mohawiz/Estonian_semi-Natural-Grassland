import { describe, expect, it } from 'vitest';
import { en } from './en';
import { et } from './et';
import { flattenKeys, translate } from './index';

describe('translations', () => {
  it('Estonian and English have exactly the same keys', () => {
    expect(flattenKeys(et).sort()).toEqual(flattenKeys(en).sort());
  });
  it('has no empty strings', () => {
    for (const k of flattenKeys(et)) expect(translate('et', k).trim(), k).not.toBe('');
  });
  it('interpolates variables', () => {
    expect(translate('en', 'tour.progress', { n: 2, total: 7 })).toBe('Step 2 of 7');
    expect(translate('et', 'tour.progress', { n: 2, total: 7 })).toBe('Samm 2 / 7');
  });
  it("labels the 15-day figure as PRIA's and unverified for the Board in both languages", () => {
    expect(translate('en', 'deadlines.configHelp')).toMatch(/PRIA.*NOT verified for the Environmental Board/s);
    expect(translate('et', 'deadlines.configHelp')).toMatch(/PRIA.*Keskkonnaameti puhul seda EI OLE kontrollitud/s);
  });
});
