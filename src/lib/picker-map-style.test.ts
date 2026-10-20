import { describe, expect, it } from 'vitest';
import { PICKER_MAP_STYLE } from './picker-map-style';
import { JOB_MAP_STYLE } from './native-job-map';
import { featureFilter, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { findPickerMapContext } from './job-location-snap';
import { SANTA_ANA_PATEROS_INTERIOR_TEST_PIN as pin } from './santa-ana-service-area';

describe('picker-only neighborhood map style', () => {
  it('renders transit through one layer while retaining named schools and shops in queryable POI layers', () => {
    const poi = PICKER_MAP_STYLE.layers.filter(l => /^poi_r(1|7|20)$/.test(l.id));
    const matches = (category: string, rank: number) => poi.filter(l => featureFilter('filter' in l ? l.filter : undefined, 'layers[0].filter').filter({ zoom: 17 }, { type: 1, properties: { class: category, rank, name: 'Mapped place' } }));
    expect(matches('bus', 12)).toHaveLength(0);
    expect(matches('school', 24)).toHaveLength(1);
    expect(matches('shop', 44)).toHaveLength(1);
    expect(PICKER_MAP_STYLE.layers.find(l => l.id === 'poi_transit')).toBeDefined();
  });
  it('separates streets, footprints and canvas and gives colliding POIs alternate label positions', () => {
    const layers = PICKER_MAP_STYLE.layers;
    const paint = (id: string) => layers.find(l => l.id === id)!.paint as Record<string, unknown>;
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const contrast = (a: unknown, b: unknown) => {
      const [dark, light] = [luminance(a as string), luminance(b as string)].sort((x,y) => x-y);
      return (light + .05) / (dark + .05);
    };
    expect(contrast(paint('road_minor')['line-color'], paint('background')['background-color'])).toBeGreaterThan(1.8);
    expect(contrast(paint('road_minor')['line-color'], paint('building-3d')['fill-color'])).toBeGreaterThan(1.5);
    expect(contrast(paint('building-3d')['fill-color'], paint('background')['background-color'])).toBeGreaterThan(1.1);
    expect(paint('road_minor')['line-dasharray']).toBeUndefined();
    expect(paint('road_path_pedestrian')['line-dasharray']).toBeDefined();
    for (const id of ['poi_r1', 'poi_r7', 'poi_r20']) {
      expect(layers.find(l => l.id === id)).toMatchObject({ layout: { 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-allow-overlap': false, 'icon-allow-overlap': false } });
    }
  });
  it('is a valid native style with retained license notices', () => {
    expect(validateStyleMin(PICKER_MAP_STYLE)).toEqual([]);
    expect(PICKER_MAP_STYLE.metadata).toHaveProperty('skillmatch:license-notices');
  });
  it('retains flat visual buildings without automatic centroid attraction', async () => {
    const layer = PICKER_MAP_STYLE.layers.find(item => item.id === 'building-3d')!;
    const lon = pin.longitude + 0.00003;
    const lat = pin.latitude;
    const result = await findPickerMapContext({
      project: async ([x, y]) => [200 + (x - pin.longitude) * 100000, 200 + (y - lat) * 100000],
      queryRenderedFeatures: async (_bounds, { layers }) => layers.includes(layer.id) ? [{
        layer: { id: layer.id }, geometry: { type: 'Polygon', coordinates: [[[lon-.00001,lat-.00001],[lon+.00001,lat-.00001],[lon+.00001,lat+.00001],[lon-.00001,lat+.00001],[lon-.00001,lat-.00001]]] },
      }] : [],
    }, pin, 17);
    expect(result.snap).toBeNull();
    expect(result.nearby).toEqual([]);
  });
  it('uses neutral roads and readable ranked POIs while keeping collision control and category icons', () => {
    const layers = PICKER_MAP_STYLE.layers;
    expect(layers.find(layer => layer.id === 'road_trunk_primary')).toMatchObject({ paint: { 'line-color': '#95a39f' } });
    for (const id of ['poi_r1', 'poi_r7', 'poi_r20']) {
      const layer = layers.find(item => item.id === id);
      expect(layer).toMatchObject({ type: 'symbol', layout: { 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false, 'icon-allow-overlap': false }, paint: { 'text-halo-color': '#ffffff' } });
      expect(layer && 'layout' in layer && layer.layout && 'icon-image' in layer.layout).toBe(true);
      expect(layer && 'filter' in layer && layer.filter).toBeDefined();
    }
    expect(layers.find(layer => layer.id === 'highway-name-path')).toMatchObject({ paint: { 'text-color': '#34443e' } });
  });
  it('retains licensed provider resources without changing shared maps', () => {
    expect(JOB_MAP_STYLE).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(PICKER_MAP_STYLE.sources.openmaptiles).toMatchObject({ type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
    expect(PICKER_MAP_STYLE.sources.ne2_shaded).toBeDefined();
    expect(PICKER_MAP_STYLE.glyphs).toBe('https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf');
    expect(PICKER_MAP_STYLE.sprite).toBe('https://tiles.openfreemap.org/sprites/ofm_f384/ofm');
    expect(PICKER_MAP_STYLE.layers.find(layer => layer.id === 'building-3d')).toMatchObject({
      type: 'fill', source: 'openmaptiles', 'source-layer': 'building',
      paint: { 'fill-color': '#dfe4e1', 'fill-outline-color': '#cbd3ce' },
    });
    expect(PICKER_MAP_STYLE.layers.some(layer => layer.type === 'fill-extrusion')).toBe(false);
  });
});
