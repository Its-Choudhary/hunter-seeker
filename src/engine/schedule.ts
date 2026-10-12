// The game clock. Every phone computes the same schedule from the start time,
// the settings and the pause history — so no phone has to be "the host".

import type { Settings } from './types';

export interface Pause {
  at: number;
  until?: number; // undefined = still paused
  by: string;
}

export type Phase = 'hiding' | 'hunting' | 'over';

export interface Slot {
  i: number; // index in the slot list (stable across phones)
  gt: number; // game time (ms since start, excluding pauses)
  full: boolean; // full = exact ping to hunters + rough circle; else rough circle only
}

const MIN = 60_000;

export const hideMs = (s: Settings) => s.headStartMin * MIN;
export const endMs = (s: Settings) => (s.headStartMin + s.durationMin) * MIN;

export function pausedMs(startAt: number, pauses: Pause[], now: number): number {
  let total = 0;
  for (const p of pauses) {
    const a = Math.max(p.at, startAt);
    const b = Math.min(p.until ?? now, now);
    if (b > a) total += b - a;
  }
  return total;
}

/** Milliseconds of play since the start, not counting pauses. */
export function gameTime(startAt: number, pauses: Pause[], now: number): number {
  return now - startAt - pausedMs(startAt, pauses, now);
}

/** Wall-clock time at which a given game time happens (assuming no new pauses). */
export function wallTime(startAt: number, pauses: Pause[], gt: number, now: number): number {
  let wall = startAt + gt;
  const sorted = [...pauses].sort((a, b) => a.at - b.at);
  for (const p of sorted) if (p.at < wall) wall += Math.max(0, (p.until ?? now) - p.at);
  return wall;
}

export function phaseAt(s: Settings, gt: number): Phase {
  if (gt < hideMs(s)) return 'hiding';
  if (gt < endMs(s)) return 'hunting';
  return 'over';
}

/** Exact-ping interval at a point in the hunt (ms since hunt start). */
export function intervalAt(s: Settings, sinceHunt: number): number {
  const base = s.pingEveryMin * MIN;
  if (!s.accelerate) return base;
  const dur = s.durationMin * MIN;
  const finale = dur - Math.min(5 * MIN, dur * 0.15);
  if (sinceHunt >= finale) return 1 * MIN;
  const third = finale / 3;
  const step = sinceHunt < third ? 0 : sinceHunt < 2 * third ? 1 : 2;
  return Math.max(2 * MIN, base - step * MIN);
}

/** All ping slots for a game. First exact ping is the moment the hunt starts. */
export function pingSlots(s: Settings): Slot[] {
  const out: Slot[] = [];
  const start = hideMs(s);
  const dur = s.durationMin * MIN;
  let t = 0;
  while (t < dur) {
    out.push({ i: out.length, gt: start + t, full: true });
    const next = t + intervalAt(s, t);
    // Seekers get an extra rough circle halfway between exact pings.
    if (next - t >= 2 * MIN && (t + next) / 2 < dur) {
      out.push({ i: out.length, gt: start + (t + next) / 2, full: false });
    }
    t = next;
  }
  return out;
}

/** Last slot at or before game time gt (or null). */
export function lastSlot(slots: Slot[], gt: number, fullOnly = false): Slot | null {
  let found: Slot | null = null;
  for (const sl of slots) {
    if (sl.gt > gt) break;
    if (!fullOnly || sl.full) found = sl;
  }
  return found;
}

export function nextSlot(slots: Slot[], gt: number, fullOnly = false): Slot | null {
  for (const sl of slots) if (sl.gt > gt && (!fullOnly || sl.full)) return sl;
  return null;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}
