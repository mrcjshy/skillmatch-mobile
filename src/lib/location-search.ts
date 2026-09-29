import type { JobPin } from './job-location';

export const LOCATION_SEARCH_MIN_LENGTH = 3;
export const LOCATION_SEARCH_DEBOUNCE_MS = 400;

export type LocationSuggestion = { label: string; pin: JobPin };

export function parsePhotonSuggestions(data: unknown): LocationSuggestion[] {
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { features?: unknown }).features)) return [];
  const parsed: (LocationSuggestion & { ph: boolean })[] = [];
  for (const feature of (data as { features: unknown[] }).features) {
    if (typeof feature !== 'object' || feature === null) continue;
    const f = feature as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };
    const coordinates = f.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const [longitude, latitude] = coordinates;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
    const p = f.properties ?? {};
    const label = [p.name, p.street, p.locality, p.city, p.state, p.country]
      .filter((value, index, values): value is string => typeof value === 'string' && value.trim() !== '' && values.indexOf(value) === index)
      .join(', ');
    if (!label) continue;
    parsed.push({ label, pin: { latitude, longitude }, ph: String(p.countrycode ?? '').toUpperCase() === 'PH' });
  }
  return parsed.sort((a, b) => Number(b.ph) - Number(a.ph)).slice(0, 5).map(({ label, pin }) => ({ label, pin }));
}

export async function searchPhoton(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < LOCATION_SEARCH_MIN_LENGTH) return [];
  const params = new URLSearchParams({
    q: `${trimmed}, Philippines`,
    limit: '5',
    lang: 'en',
    lat: '14.5445',
    lon: '121.0725',
  });
  const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!response.ok) throw new Error('location search unavailable');
  return parsePhotonSuggestions(await response.json());
}
