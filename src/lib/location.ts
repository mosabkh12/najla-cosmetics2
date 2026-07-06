export interface LocationSettings {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  google_maps_url?: string | null;
  business_name?: string | null;
}

const DEFAULT_ADDRESS = "Nazareth, Israel";
/** Street-level zoom for a precise pin; wide enough for a general area/city search. */
const COORD_ZOOM = 16;
const ADDRESS_ZOOM = 14;

export const LAT_RANGE = { min: -90, max: 90 };
export const LNG_RANGE = { min: -180, max: 180 };

export function isValidLatitude(v: number): boolean {
  return Number.isFinite(v) && v >= LAT_RANGE.min && v <= LAT_RANGE.max;
}
export function isValidLongitude(v: number): boolean {
  return Number.isFinite(v) && v >= LNG_RANGE.min && v <= LNG_RANGE.max;
}

function hasCoords(
  s?: LocationSettings | null,
): s is LocationSettings & { latitude: number; longitude: number } {
  return (
    s?.latitude != null &&
    s?.longitude != null &&
    isValidLatitude(s.latitude) &&
    isValidLongitude(s.longitude)
  );
}

/** Google's classic (no-API-key) embed accepts an optional "(label)" suffix on a coordinate query, shown on the pin. */
function coordQuery(lat: number, lng: number, label?: string | null): string {
  const base = `${lat},${lng}`;
  if (!label?.trim()) return base;
  // Parens/commas inside the label would break Google's parsing of the q param — strip them.
  const safeLabel = label.trim().replace(/[(),]/g, "");
  return `${base}(${safeLabel})`;
}

/** Embeddable map iframe src — pins the exact coordinates when available, falls back to a text search. */
export function getMapEmbedSrc(s?: LocationSettings | null): string {
  if (hasCoords(s)) {
    const q = coordQuery(s.latitude, s.longitude, s.business_name);
    return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${COORD_ZOOM}&output=embed`;
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(s?.address || DEFAULT_ADDRESS)}&z=${ADDRESS_ZOOM}&output=embed`;
}

/** "Get Directions" link — precise coordinates when available, otherwise the admin's own Maps link, otherwise a text search. */
export function getGoogleMapsDirectionsUrl(s?: LocationSettings | null): string {
  if (hasCoords(s))
    return `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`;
  if (s?.google_maps_url) return s.google_maps_url;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s?.address || DEFAULT_ADDRESS)}`;
}

/** Waze navigation link — precise coordinates when available, otherwise a text search. */
export function getWazeUrl(s?: LocationSettings | null): string {
  if (hasCoords(s)) return `https://waze.com/ul?ll=${s.latitude},${s.longitude}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(s?.address || DEFAULT_ADDRESS)}&navigate=yes`;
}

/** Opens Google Maps search for the given address — used by the admin panel to help find exact coordinates. */
export function getFindOnMapsUrl(address?: string | null): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || DEFAULT_ADDRESS)}`;
}
