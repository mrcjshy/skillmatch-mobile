import type { StyleSpecification } from '@maplibre/maplibre-react-native';
// Metro bundles this local JSON; no runtime fetch or render-time style rebuilding.
const style = require('../assets/maps/picker-liberty.json');

// Picker-only adaptation of https://tiles.openfreemap.org/styles/liberty.
// Provider source, glyph and sprite URLs are retained, including TileJSON attribution.
// Keep this module-level object stable: changing style identity can reload the map.
export const PICKER_MAP_STYLE = style as StyleSpecification;
