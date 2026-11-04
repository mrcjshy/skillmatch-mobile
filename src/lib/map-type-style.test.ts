// @ts-expect-error -- Node-only static check of the bundled style.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const style = JSON.parse(readFileSync('src/assets/maps/hybrid-satellite.json', 'utf8'));

describe('Hybrid satellite map style', () => {
  it('draws Esri imagery first, then roads and labels from OpenFreeMap', () => {
    expect(style.version).toBe(8);
    expect(style.layers[0]).toMatchObject({ id: 'satellite', type: 'raster', source: 'satellite' });
    expect(style.sources.satellite.tiles[0]).toMatch(/^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\//);
    expect(style.sources.satellite.attribution).toMatch(/Esri/);
    expect(style.sources.openmaptiles).toEqual({ type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
    expect(style.layers.some((l: { type: string }) => l.type === 'fill' || l.type === 'background')).toBe(false);
  });

  it('keeps the POI layer ids the picker snaps to, with labels readable on photos', () => {
    const ids = style.layers.map((l: { id: string }) => l.id);
    for (const id of ['poi_r1', 'poi_r7', 'poi_r20', 'highway-name-minor', 'label_village']) expect(ids).toContain(id);
    const minor = style.layers.find((l: { id: string }) => l.id === 'highway-name-minor');
    expect(minor.paint).toMatchObject({ 'text-color': '#ffffff' });
  });
});

describe('Map / Satellite toggle never sits on a details sheet (owner report 2026-11-04)', () => {
  const src = (file: string) => readFileSync(`src/components/${file}`, 'utf8');

  it('has no zIndex, so it cannot be lifted out of the map layer above a sheet', () => {
    expect(src('map-type-toggle.tsx')).not.toMatch(/zIndex\s*:/);
  });

  it('steps aside on the booking map while the details sheet is expanded', () => {
    expect(src('booking-location-map.tsx')).toContain('{pinsPaused ? null : <MapTypeToggle');
    expect(src('booking-details.tsx')).toContain("pinsPaused={sheetPosition === 'expanded'}");
  });

  it('steps aside on the open-job map while the Job details panel is expanded', () => {
    expect(src('finding-job-map.tsx')).toContain('{sheetExpanded ? null : <MapTypeToggle');
    expect(src('client-job-details.tsx')).toContain("sheetExpanded={sheetPosition === 'expanded'}");
  });
});

describe('Worker swipe-to-confirm thumb wears the Post a job cobalt (owner 2026-11-04)', () => {
  it('lights the live thumb with the shared lit gradient and cobalt shadow, and keeps the spent thumb flat', () => {
    const src = readFileSync('src/components/swipe-confirmation.tsx', 'utf8');
    expect(src).toContain("import { COBALT_LIT, COBALT_SHADOW } from '@/constants/cobalt-material';");
    expect(src).toContain('thumbColor === ui.colors.accent ? styles.thumbLit : null');
    expect(src).toContain('thumbLit: { experimental_backgroundImage: COBALT_LIT, boxShadow: COBALT_SHADOW }');
  });
});
