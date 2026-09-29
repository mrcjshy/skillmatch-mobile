export const JOB_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

type MapRuntime = Pick<typeof import('@maplibre/maplibre-react-native'),
  'Map' | 'Camera' | 'Marker' | 'ViewAnnotation'>;

function loadRuntime(): MapRuntime | null {
  try {
    // Keep a missing native module inside the existing presentation fallback.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@maplibre/maplibre-react-native') as MapRuntime;
  } catch {
    return null;
  }
}

export const jobMapRuntime = loadRuntime();
