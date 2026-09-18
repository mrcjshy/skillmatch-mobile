/**
 * Official NAMRIA/PSA COD-AB v03 Santa Ana, Pateros ADM4 ring.
 * Source: private.santa_ana_pateros_boundary_ring() — HDX cod-ab-phl,
 * phl_admin4.shp, adm4_pcode PH1307606007, PSGC 1381701007, EPSG:4326.
 * Each pair is [longitude, latitude]. Vertices/edges count as inside.
 * The shapefile display centroid is not the geofence.
 * This is a TypeScript constant, not a GeoJSON asset.
 */

export const SANTA_ANA_PATEROS_ADM4_PCODE = 'PH1307606007';
export const SANTA_ANA_PATEROS_PSGC = '1381701007';

/** Official interior test pin used in R5E after the V3-1 geofence. Not the geofence. */
export const SANTA_ANA_PATEROS_INTERIOR_TEST_PIN = {
  latitude: 14.5444514,
  longitude: 121.07205067,
} as const;

/** Pre-V3 R5E fixture pin. Outside the official Santa Ana polygon. */
export const SANTA_ANA_PATEROS_OUTSIDE_LEGACY_PIN = {
  latitude: 14.55801,
  longitude: 121.06942,
} as const;

export type LngLat = readonly [longitude: number, latitude: number];

export const SANTA_ANA_PATEROS_BOUNDARY_RING: readonly LngLat[] = [
  [121.0739152770, 14.5486115600],
  [121.0740378720, 14.5484979970],
  [121.0740618600, 14.5484084390],
  [121.0740482150, 14.5483656250],
  [121.0744552350, 14.5481133440],
  [121.0748260490, 14.5482162840],
  [121.0749289730, 14.5482230430],
  [121.0748895350, 14.5479570030],
  [121.0749496940, 14.5479347220],
  [121.0750276160, 14.5479167840],
  [121.0751145740, 14.5478901600],
  [121.0751815280, 14.5478734490],
  [121.0752144020, 14.5478450580],
  [121.0752517590, 14.5478136780],
  [121.0752936000, 14.5477852860],
  [121.0753399230, 14.5477852860],
  [121.0753982000, 14.5477718380],
  [121.0754559860, 14.5477490300],
  [121.0755105490, 14.5477224480],
  [121.0755525210, 14.5476930670],
  [121.0755791030, 14.5476608890],
  [121.0756322680, 14.5476399030],
  [121.0756966240, 14.5476105220],
  [121.0757612350, 14.5475847530],
  [121.0758276290, 14.5475697610],
  [121.0758854560, 14.5475633360],
  [121.0759454250, 14.5475590520],
  [121.0760909960, 14.5475226690],
  [121.0763534920, 14.5473854730],
  [121.0764194480, 14.5473415030],
  [121.0764735660, 14.5473127530],
  [121.0765141540, 14.5472721640],
  [121.0765438760, 14.5472399180],
  [121.0765755370, 14.5472399180],
  [121.0766359810, 14.5472255260],
  [121.0766820340, 14.5471881080],
  [121.0767223300, 14.5471305420],
  [121.0767712610, 14.5470960030],
  [121.0768086790, 14.5470585850],
  [121.0768403410, 14.5470211670],
  [121.0768662450, 14.5469952630],
  [121.0768950280, 14.5469693580],
  [121.0769266890, 14.5469520880],
  [121.0769525940, 14.5469492100],
  [121.0769928900, 14.5469204270],
  [121.0770159170, 14.5468772520],
  [121.0770533340, 14.5468513480],
  [121.0770993870, 14.5468139300],
  [121.0771684660, 14.5467707550],
  [121.0772490590, 14.5467045550],
  [121.0773440420, 14.5466297190],
  [121.0774248790, 14.5466165680],
  [121.0775869700, 14.5466663920],
  [121.0777392270, 14.5467512880],
  [121.0778987200, 14.5468049480],
  [121.0780234190, 14.5468672970],
  [121.0780576600, 14.5468941640],
  [121.0774137940, 14.5459979930],
  [121.0773025170, 14.5459066400],
  [121.0767646550, 14.5454623340],
  [121.0763972710, 14.5453311260],
  [121.0760430080, 14.5452130380],
  [121.0757412280, 14.5448456540],
  [121.0756231400, 14.5444782700],
  [121.0756013580, 14.5444245290],
  [121.0754263270, 14.5439927980],
  [121.0751507890, 14.5434942050],
  [121.0747309220, 14.5432842710],
  [121.0743785080, 14.5431103060],
  [121.0741929660, 14.5430218540],
  [121.0739277230, 14.5429543840],
  [121.0737742850, 14.5429151710],
  [121.0735631650, 14.5428512830],
  [121.0730645720, 14.5426544700],
  [121.0725791000, 14.5423658110],
  [121.0720673870, 14.5419590640],
  [121.0719878620, 14.5417385880],
  [121.0718641070, 14.5413870250],
  [121.0717656070, 14.5411849340],
  [121.0717123310, 14.5411260320],
  [121.0716353960, 14.5410407600],
  [121.0715423400, 14.5408480000],
  [121.0713961090, 14.5406685350],
  [121.0712631710, 14.5404358940],
  [121.0710571180, 14.5403295440],
  [121.0708842990, 14.5402963090],
  [121.0707247730, 14.5402763690],
  [121.0705187200, 14.5402630750],
  [121.0703791350, 14.5402763690],
  [121.0701930230, 14.5402963090],
  [121.0699907940, 14.5403439930],
  [121.0699271470, 14.5403627780],
  [121.0696413310, 14.5404425410],
  [121.0694286310, 14.5405355970],
  [121.0692159310, 14.5406220060],
  [121.0691295220, 14.5406751810],
  [121.0689699960, 14.5406751810],
  [121.0688104710, 14.5407748850],
  [121.0686841800, 14.5408014720],
  [121.0686253050, 14.5408468030],
  [121.0685941370, 14.5408747730],
  [121.0685379490, 14.5409211160],
  [121.0683784240, 14.5410008790],
  [121.0681657240, 14.5410872880],
  [121.0679330830, 14.5412002850],
  [121.0673967940, 14.5414599930],
  [121.0673047940, 14.5415869930],
  [121.0672437940, 14.5416669930],
  [121.0671573000, 14.5418460130],
  [121.0671907940, 14.5419599930],
  [121.0672127940, 14.5421269930],
  [121.0681790170, 14.5439786820],
  [121.0683320840, 14.5441809790],
  [121.0683511590, 14.5442096490],
  [121.0685379490, 14.5445370200],
  [121.0686083050, 14.5446607190],
  [121.0686890520, 14.5448928680],
  [121.0687496130, 14.5449877460],
  [121.0688833540, 14.5451783880],
  [121.0688902340, 14.5451884150],
  [121.0690364650, 14.5453745280],
  [121.0692434280, 14.5456007090],
  [121.0694121960, 14.5458032300],
  [121.0695269580, 14.5459416200],
  [121.0697328540, 14.5461508910],
  [121.0698062010, 14.5462224740],
  [121.0698439460, 14.5462596240],
  [121.0699049970, 14.5463196590],
  [121.0700933200, 14.5464845570],
  [121.0703883630, 14.5467356750],
  [121.0706051300, 14.5468634290],
  [121.0706813710, 14.5469087550],
  [121.0708099410, 14.5469847480],
  [121.0709308270, 14.5470561890],
  [121.0711568210, 14.5471891270],
  [121.0714226960, 14.5472954770],
  [121.0715146920, 14.5473325790],
  [121.0715690440, 14.5473525150],
  [121.0716838050, 14.5473727670],
  [121.0717816910, 14.5474166470],
  [121.0719875870, 14.5475111570],
  [121.0721937350, 14.5476677020],
  [121.0724330220, 14.5477275240],
  [121.0725859010, 14.5477740520],
  [121.0727986010, 14.5478604620],
  [121.0730113010, 14.5479402240],
  [121.0731575850, 14.5481369030],
  [121.0732626110, 14.5483539560],
  [121.0731886760, 14.5485971500],
  [121.0732622410, 14.5486115430],
  [121.0734699360, 14.5486447940],
  [121.0737690460, 14.5486846750],
  [121.0739152770, 14.5486115600]
] as const;

export type SantaAnaRingBBox = {
  west: string;
  south: string;
  east: string;
  north: string;
};

const RING_COORD_DECIMALS = 10;
const RING_BBOX_DECIMALS = 8;

function serializeLngLat(lng: number, lat: number): string {
  return `${lng.toFixed(RING_COORD_DECIMALS)},${lat.toFixed(RING_COORD_DECIMALS)}`;
}

export function serializeSantaAnaRing(
  ring: readonly LngLat[] = SANTA_ANA_PATEROS_BOUNDARY_RING
): string {
  return ring.map(([lng, lat]) => serializeLngLat(lng, lat)).join(';');
}

export function djb2Hex(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function santaAnaRingVertexCount(
  ring: readonly LngLat[] = SANTA_ANA_PATEROS_BOUNDARY_RING
): number {
  return ring.length;
}

export function santaAnaRingUniqueVertexCount(
  ring: readonly LngLat[] = SANTA_ANA_PATEROS_BOUNDARY_RING
): number {
  return new Set(ring.map(([lng, lat]) => serializeLngLat(lng, lat))).size;
}

export function santaAnaRingBBox(
  ring: readonly LngLat[] = SANTA_ANA_PATEROS_BOUNDARY_RING
): SantaAnaRingBBox {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of ring) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return {
    west: west.toFixed(RING_BBOX_DECIMALS),
    south: south.toFixed(RING_BBOX_DECIMALS),
    east: east.toFixed(RING_BBOX_DECIMALS),
    north: north.toFixed(RING_BBOX_DECIMALS),
  };
}

export function santaAnaRingFingerprint(
  ring: readonly LngLat[] = SANTA_ANA_PATEROS_BOUNDARY_RING
): string {
  return djb2Hex(serializeSantaAnaRing(ring));
}

export type JobCoordinate = { latitude: number; longitude: number };

/**
 * Even-odd point-in-polygon matching private.point_in_service_area_ring.
 * Vertices and edges count as inside. Non-finite coordinates are outside.
 */
export function isPinInSantaAnaServiceArea(
  latitude: number,
  longitude: number
): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  const ring = SANTA_ANA_PATEROS_BOUNDARY_RING;
  if (ring.length < 4) return false;

  for (const [lng, lat] of ring) {
    if (lng === longitude && lat === latitude) return true;
  }

  let inside = false;
  let j = ring.length - 1;
  for (let i = 0; i < ring.length; i += 1) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) {
      return false;
    }
    if (yi > latitude !== yj > latitude) {
      const den = yj - yi;
      if (den !== 0 && longitude < ((xj - xi) * (latitude - yi)) / den + xi) {
        inside = !inside;
      }
    }
    j = i;
  }
  return inside;
}

export type ReverseGeocodeAddress = {
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
  region?: string | null;
  name?: string | null;
  street?: string | null;
  formattedAddress?: string | null;
};

function normalizePlace(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function addressHaystack(address: ReverseGeocodeAddress): string {
  return [
    address.city,
    address.district,
    address.subregion,
    address.region,
    address.name,
    address.street,
    address.formattedAddress,
  ]
    .map(normalizePlace)
    .filter((part) => part.length > 0)
    .join(' ');
}

/**
 * Reverse-geocode interpretation only. The official polygon remains the geofence.
 * Unknown / empty addresses defer to the polygon check.
 */
export function classifySantaAnaPaterosGeocode(
  address: ReverseGeocodeAddress | null | undefined
): 'inside' | 'outside' | 'unknown' {
  if (address == null) return 'unknown';
  const haystack = addressHaystack(address);
  if (haystack.length === 0) return 'unknown';

  const hasSantaAna = haystack.includes('santa ana');
  const hasPateros = haystack.includes('pateros');
  if (hasSantaAna && hasPateros) return 'inside';
  if (hasPateros && !hasSantaAna) return 'outside';

  const foreignCities = ['makati', 'taguig', 'pasig', 'mandaluyong', 'pasay', 'makati city'];
  if (foreignCities.some((city) => haystack.includes(city)) && !hasSantaAna) {
    return 'outside';
  }
  return 'unknown';
}

export type JobPinPlacement =
  | { ok: true }
  | { ok: false; reason: 'outside' | 'invalid' };

/**
 * The official polygon is the geofence. Reverse geocode is ignored for
 * accept/reject and remains available only for address autofill.
 */
export function evaluateSantaAnaJobPin(
  pin: JobCoordinate,
  _geocode?: ReverseGeocodeAddress | null
): JobPinPlacement {
  if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) {
    return { ok: false, reason: 'invalid' };
  }
  if (!isPinInSantaAnaServiceArea(pin.latitude, pin.longitude)) {
    return { ok: false, reason: 'outside' };
  }
  return { ok: true };
}
