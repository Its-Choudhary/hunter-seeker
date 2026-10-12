import type { LatLon, Zone } from './types';

const R = 6371000; // earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

export function distance(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from a to b in degrees (0 = north). */
export function bearing(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Move from a point by metres north/east. Fine for game-sized distances. */
export function offset(p: LatLon, north: number, east: number): LatLon {
  return {
    lat: p.lat + (north / R) * (180 / Math.PI),
    lon: p.lon + (east / (R * Math.cos(rad(p.lat)))) * (180 / Math.PI),
  };
}

// Local flat projection (metres) around an origin — accurate enough within a few km.
function project(origin: LatLon, p: LatLon): [number, number] {
  return [rad(p.lon - origin.lon) * R * Math.cos(rad(origin.lat)), rad(p.lat - origin.lat) * R];
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

export function zoneCenter(zone: Zone): LatLon {
  if (zone.kind === 'circle') return zone.center;
  const n = zone.points.length || 1;
  return {
    lat: zone.points.reduce((s, p) => s + p.lat, 0) / n,
    lon: zone.points.reduce((s, p) => s + p.lon, 0) / n,
  };
}

/**
 * Signed distance from p to the zone edge in metres:
 * negative = inside (how far from the edge), positive = outside.
 */
export function edgeDistance(zone: Zone, p: LatLon): number {
  if (zone.kind === 'circle') return distance(zone.center, p) - zone.radius;
  const pts = zone.points;
  if (pts.length < 3) return Infinity;
  const origin = zoneCenter(zone);
  const proj = pts.map((q) => project(origin, q));
  const [px, py] = project(origin, p);
  let inside = false;
  let min = Infinity;
  for (let i = 0, j = proj.length - 1; i < proj.length; j = i++) {
    const [xi, yi] = proj[i];
    const [xj, yj] = proj[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    min = Math.min(min, segDist(px, py, xj, yj, xi, yi).d);
  }
  return inside ? -min : min;
}

/** Closest point on the zone edge — used to point a player back inside. */
export function nearestEdgePoint(zone: Zone, p: LatLon): LatLon {
  if (zone.kind === 'circle') {
    const d = distance(zone.center, p) || 1;
    const k = zone.radius / d;
    return {
      lat: zone.center.lat + (p.lat - zone.center.lat) * k,
      lon: zone.center.lon + (p.lon - zone.center.lon) * k,
    };
  }
  const pts = zone.points;
  let best = pts[0];
  let bestD = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const origin = zoneCenter(zone);
    const [ax, ay] = project(origin, pts[j]);
    const [bx, by] = project(origin, pts[i]);
    const [px, py] = project(origin, p);
    const { d, t } = segDist(px, py, ax, ay, bx, by);
    if (d < bestD) {
      bestD = d;
      best = {
        lat: pts[j].lat + (pts[i].lat - pts[j].lat) * t,
        lon: pts[j].lon + (pts[i].lon - pts[j].lon) * t,
      };
    }
  }
  return best;
}

/** Rough size of the zone (max distance across), for UI and sanity checks. */
export function zoneSpan(zone: Zone): number {
  if (zone.kind === 'circle') return zone.radius * 2;
  let max = 0;
  for (const a of zone.points) for (const b of zone.points) max = Math.max(max, distance(a, b));
  return max;
}

/** Random point uniformly inside a disc of radius r around p. rand() in [0,1). */
export function randomInDisc(p: LatLon, r: number, rand: () => number): LatLon {
  const d = r * Math.sqrt(rand());
  const a = rand() * 2 * Math.PI;
  return offset(p, d * Math.cos(a), d * Math.sin(a));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
