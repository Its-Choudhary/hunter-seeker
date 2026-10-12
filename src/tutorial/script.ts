// The "How to play" walkthrough: a scripted example round.
//
// Every event is placed at (step, seconds into that step), so each step can
// be as long as its narration needs in either language. Player movement is
// sent to the map as keyframed paths and animated there at full frame rate.

import { offset } from '../engine/geo';
import type { LatLon, Zone } from '../engine/types';
import type { MapCircle, MapMarker, MapScene } from '../map/mapHtml';
import { C, ROLE } from '../ui/theme';
import { type Lang, WORDS } from './content';
import { VOICE } from './voice';

const BASE = [7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 9]; // minimum seconds per step

export interface Timeline {
  lang: Lang;
  durs: number[];
  starts: number[];
  total: number;
}

export function timeline(lang: Lang): Timeline {
  const durs = BASE.map((b, i) => Math.max(b, Math.ceil((VOICE[lang][i].sec + 1.3) * 2) / 2));
  const starts = durs.reduce<number[]>((a, _, i) => [...a, i ? a[i - 1] + durs[i - 1] : 0], []);
  return { lang, durs, starts, total: starts[starts.length - 1] + durs[durs.length - 1] };
}

export const stepAt = (tl: Timeline, t: number) => {
  let i = 0;
  while (i + 1 < tl.starts.length && tl.starts[i + 1] <= t) i++;
  return i;
};

// ---- the example round ----

export const CENTER: LatLon = { lat: 26.2934, lon: 73.0243 };
const R = 400;
export const ZONE: Zone = { kind: 'circle', center: CENTER, radius: R };
const at = (n: number, e: number) => offset(CENTER, n, e);

export const CAST = {
  priya: { name: 'Priya', color: '#f472b6', role: 'hider' as const },
  kabir: { name: 'Kabir', color: '#22c3ee', role: 'hider' as const },
  aman: { name: 'Aman', color: '#fb923c', role: 'hunter' as const },
  rahul: { name: 'Rahul', color: '#facc15', role: 'seeker' as const },
};
type Who = keyof typeof CAST;

type Key = [step: number, sec: number, north: number, east: number];

const PATHS: Record<Who, Key[]> = {
  priya: [[0, 0, -120, -70], [3, 0, -120, -70], [3, 6, 200, -190], [5, 1, 200, -190], [5, 6, 310, -30]],
  kabir: [[0, 0, -120, 70], [3, 0, -120, 70], [3, 6, 110, 220], [5, 1, 110, 220], [5, 6, 220, 300]],
  aman: [[0, 0, -205, -65], [4, 1, -205, -65], [5, 5, 110, 220], [7, 3, 110, 220], [8, 0.5, 212, 292], [9, 0, 212, 292], [9, 3, 270, 430]],
  rahul: [[0, 0, -205, 65], [6, 0, -205, 65], [6, 7.5, 320, 230]],
};

// Event moments, as (step, seconds into step).
const PING: [number, number] = [4, 1];
const HIDERS_MOVED: [number, number] = [5, 2];
const CIRCLE: [number, number] = [6, 1];
const SPOT: [number, number] = [7, 2];
const CAUGHT: [number, number] = [8, 5];
export const OUT_OFF = 2.5; // seconds into step 9
export const FROZEN_OFF = 5.5;

const abs = (tl: Timeline, [s, sec]: [number, number]) => tl.starts[s] + sec;

/** Absolute-time path for a player: [t, lat, lon][]. */
function path(tl: Timeline, who: Who): [number, number, number][] {
  return PATHS[who].map(([s, sec, n, e]) => {
    const p = at(n, e);
    return [tl.starts[s] + sec, p.lat, p.lon];
  });
}

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** Where a player is at time t (same easing the map uses). */
function pos(tl: Timeline, who: Who, t: number): LatLon {
  const p = path(tl, who);
  if (t <= p[0][0]) return { lat: p[0][1], lon: p[0][2] };
  for (let i = 1; i < p.length; i++) {
    if (t <= p[i][0]) {
      const k = ease((t - p[i - 1][0]) / (p[i][0] - p[i - 1][0] || 1));
      return { lat: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k, lon: p[i - 1][2] + (p[i][2] - p[i - 1][2]) * k };
    }
  }
  const last = p[p.length - 1];
  return { lat: last[1], lon: last[2] };
}

/**
 * The map scene at time t. Only changes when something *happens* (a ping, a
 * catch…), so it's sent to the map rarely; movement runs inside the map.
 */
export function sceneAt(tl: Timeline, t: number, clock: { t: number; wall: number; playing: boolean }): MapScene {
  const w = WORDS[tl.lang].map;
  const markers: MapMarker[] = [];
  const circles: MapCircle[] = [];
  const roles = t >= tl.starts[2];
  const pingAt = abs(tl, PING);
  const spotAt = abs(tl, SPOT);
  const caughtAt = abs(tl, CAUGHT);

  if (t >= pingAt) {
    const fresh = t < pingAt + 5;
    const moved = t >= abs(tl, HIDERS_MOVED);
    (['priya', 'kabir'] as const).forEach((who) => {
      if (who === 'kabir' && t >= caughtAt) return;
      markers.push({
        id: 'ping-' + who,
        ...pos(tl, who, pingAt),
        kind: 'icon',
        icon: 'pin',
        color: CAST[who].color,
        size: 26,
        pulse: fresh,
        faded: moved,
        label: moved && t < tl.starts[6] ? w.oldPing(CAST[who].name) : undefined,
      });
    });
  }
  if (t >= abs(tl, CIRCLE) && t < spotAt) {
    const c = at(185, 250);
    circles.push({ id: 'fuzzy', ...c, radius: 130, color: CAST.kabir.color, dashed: true, fill: 0.14 });
    markers.push({ id: 'fuzzy-q', ...c, kind: 'icon', icon: 'question', color: CAST.kabir.color, size: 22, label: w.somewhere(CAST.kabir.name) });
  }
  if (t >= spotAt && t < caughtAt) {
    markers.push({ id: 'spot', ...pos(tl, 'rahul', spotAt), kind: 'icon', icon: 'eye', color: ROLE.seeker.color, size: 24 });
    markers.push({ id: 'reveal', ...pos(tl, 'kabir', spotAt), kind: 'icon', icon: 'pin', color: CAST.kabir.color, size: 28, pulse: true });
  }
  if (t >= tl.starts[10] && t < tl.starts[11]) {
    markers.push({ id: 'sos', ...pos(tl, 'rahul', tl.starts[10]), kind: 'icon', icon: 'sos', color: C.bad, size: 32, pulse: true, label: 'SOS' });
  }

  (Object.keys(CAST) as Who[]).forEach((who) => {
    const c = CAST[who];
    const caught = who === 'kabir' && t >= caughtAt;
    const frozen = who === 'aman' && t >= tl.starts[9] + FROZEN_OFF;
    const p = path(tl, who);
    markers.push({
      id: who,
      lat: p[0][1],
      lon: p[0][2],
      path: p,
      kind: 'avatar',
      text: c.name[0],
      color: c.color,
      ring: frozen ? C.ice : roles ? ROLE[c.role].color : '#ffffff',
      size: 26,
      faded: caught,
      label: caught ? undefined : `${c.name}${frozen ? ' · ' + w.frozen : ''}`,
    });
  });

  return {
    zone: t >= tl.starts[1] ? ZONE : null,
    grow: { t0: tl.starts[1] + 0.5, dur: 2.5 },
    markers,
    circles,
    fit: 1,
    fitTo: ZONE,
    interactive: false,
    layer: 'dark',
    clock,
  };
}
