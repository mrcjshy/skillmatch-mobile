import { describe, expect, it } from 'vitest';

import {
  SANTA_ANA_PATEROS_ADM4_PCODE,
  SANTA_ANA_PATEROS_BOUNDARY_RING,
  SANTA_ANA_PATEROS_INTERIOR_TEST_PIN,
  SANTA_ANA_PATEROS_OUTSIDE_LEGACY_PIN,
  SANTA_ANA_PATEROS_PSGC,
  classifySantaAnaPaterosGeocode,
  evaluateSantaAnaJobPin,
  isPinInSantaAnaServiceArea,
  santaAnaRingBBox,
  santaAnaRingFingerprint,
  santaAnaRingUniqueVertexCount,
  santaAnaRingVertexCount,
} from './santa-ana-service-area';

describe('official Santa Ana, Pateros ring identity', () => {
  it('keeps the locked COD-AB identifiers and closed 153-vertex ring', () => {
    expect(SANTA_ANA_PATEROS_ADM4_PCODE).toBe('PH1307606007');
    expect(SANTA_ANA_PATEROS_PSGC).toBe('1381701007');
    expect(SANTA_ANA_PATEROS_BOUNDARY_RING).toHaveLength(153);
    expect(santaAnaRingVertexCount()).toBe(153);
    expect(SANTA_ANA_PATEROS_BOUNDARY_RING[0]).toEqual(
      SANTA_ANA_PATEROS_BOUNDARY_RING[SANTA_ANA_PATEROS_BOUNDARY_RING.length - 1]
    );
    expect(SANTA_ANA_PATEROS_BOUNDARY_RING[0]).toEqual([121.073915277, 14.54861156]);
  });

  it('counts 152 unique vertices after dropping the closing duplicate', () => {
    expect(santaAnaRingUniqueVertexCount()).toBe(152);
  });

  it('matches the locked bbox at stored 8-decimal precision', () => {
    expect(santaAnaRingBBox()).toEqual({
      west: '121.06715730',
      south: '14.54026308',
      east: '121.07805766',
      north: '14.54868468',
    });
  });

  it('keeps the djb2 fingerprint of the serialized official ring', () => {
    // Independent of this helper: SQL ring 153 vertices, lng,lat toFixed(10) joined by ';'.
    expect(santaAnaRingFingerprint()).toBe('626f7138');
  });
});

describe('isPinInSantaAnaServiceArea', () => {
  it('accepts the official interior test pin', () => {
    expect(
      isPinInSantaAnaServiceArea(
        SANTA_ANA_PATEROS_INTERIOR_TEST_PIN.latitude,
        SANTA_ANA_PATEROS_INTERIOR_TEST_PIN.longitude
      )
    ).toBe(true);
  });

  it('rejects the pre-V3 R5E fixture that sits outside Santa Ana', () => {
    expect(
      isPinInSantaAnaServiceArea(
        SANTA_ANA_PATEROS_OUTSIDE_LEGACY_PIN.latitude,
        SANTA_ANA_PATEROS_OUTSIDE_LEGACY_PIN.longitude
      )
    ).toBe(false);
  });

  it('treats a ring vertex as inside', () => {
    const vertex = SANTA_ANA_PATEROS_BOUNDARY_RING[0];
    expect(vertex).toBeDefined();
    expect(isPinInSantaAnaServiceArea(vertex![1], vertex![0])).toBe(true);
  });

  it('rejects non-finite coordinates', () => {
    expect(isPinInSantaAnaServiceArea(Number.NaN, 121.072)).toBe(false);
    expect(isPinInSantaAnaServiceArea(14.544, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('classifySantaAnaPaterosGeocode', () => {
  it('accepts a Santa Ana, Pateros reverse-geocode', () => {
    expect(
      classifySantaAnaPaterosGeocode({
        city: 'Pateros',
        district: 'Santa Ana',
        subregion: 'Metro Manila',
      })
    ).toBe('inside');
  });

  it('rejects another Pateros barangay', () => {
    expect(
      classifySantaAnaPaterosGeocode({
        city: 'Pateros',
        district: 'San Roque',
      })
    ).toBe('outside');
  });

  it('rejects a neighboring city', () => {
    expect(classifySantaAnaPaterosGeocode({ city: 'Makati', district: 'Poblacion' })).toBe(
      'outside'
    );
  });

  it('defers empty reverse-geocode results to the polygon', () => {
    expect(classifySantaAnaPaterosGeocode(null)).toBe('unknown');
    expect(classifySantaAnaPaterosGeocode({})).toBe('unknown');
  });
});

describe('evaluateSantaAnaJobPin', () => {
  it('requires the official polygon even when reverse geocode names Santa Ana', () => {
    expect(
      evaluateSantaAnaJobPin(SANTA_ANA_PATEROS_OUTSIDE_LEGACY_PIN, {
        city: 'Pateros',
        district: 'Santa Ana',
      })
    ).toEqual({ ok: false, reason: 'outside' });
  });

  it('does not let reverse geocode reject an official interior pin', () => {
    expect(
      evaluateSantaAnaJobPin(SANTA_ANA_PATEROS_INTERIOR_TEST_PIN, { city: 'Makati' })
    ).toEqual({ ok: true });
  });

  it('accepts the interior pin when reverse geocode is unavailable', () => {
    expect(evaluateSantaAnaJobPin(SANTA_ANA_PATEROS_INTERIOR_TEST_PIN, null)).toEqual({
      ok: true,
    });
  });

  it('treats 14.54445140, 121.07205067 as inside and the legacy R5E pin as outside', () => {
    expect(evaluateSantaAnaJobPin({ latitude: 14.5444514, longitude: 121.07205067 }, null)).toEqual({
      ok: true,
    });
    expect(evaluateSantaAnaJobPin({ latitude: 14.55801, longitude: 121.06942 }, null)).toEqual({
      ok: false,
      reason: 'outside',
    });
  });
});
