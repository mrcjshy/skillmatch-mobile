import { describe, expect, it } from 'vitest';

import { parsePhotonSuggestions } from './location-search';

describe('Photon suggestions', () => {
  it('rejects nonfinite and out-of-range provider coordinates before camera movement', () => {
    const features = [[121, NaN], [Infinity, 14], [121, 91], [-181, 14], [121.07205067, 14.5444514]].map(coordinates => ({ geometry: { coordinates }, properties: { name: 'Result' } }));
    expect(parsePhotonSuggestions({ features })).toEqual([{ label: 'Result', pin: { latitude: 14.5444514, longitude: 121.07205067 } }]);
  });
  it('prefers Philippine results, limits five, and keeps exact coordinates', () => {
    const features = Array.from({ length: 7 }, (_, index) => ({
      geometry: { coordinates: [121.07 + index / 1000, 14.54 + index / 1000] },
      properties: { name: `Place ${index}`, country: index === 6 ? 'Philippines' : 'Elsewhere', countrycode: index === 6 ? 'PH' : 'XX' },
    }));
    const result = parsePhotonSuggestions({ features });
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ label: 'Place 6, Philippines', pin: { longitude: 121.076, latitude: 14.546 } });
  });

  it('fails closed on malformed provider data', () => {
    expect(parsePhotonSuggestions({ features: [{ geometry: {} }] })).toEqual([]);
    expect(parsePhotonSuggestions(null)).toEqual([]);
  });
});
