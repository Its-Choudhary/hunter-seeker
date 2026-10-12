// Turns the shared message log into game state.
//
// Every phone sees (eventually) the same set of stored messages and folds them
// in the same order (by send time, then id), so every phone agrees on who is
// caught, who is frozen, whether the game is paused, and who won — without any
// server or host deciding. Only *what this phone is allowed to see* (pings,
// teammates) differs, and that never affects the shared outcome.

import {
  type GameKeys,
  catchWindow,
  openWith,
  verifyCatchToken,
} from './crypto';
import { type Pause, gameTime, hideMs, endMs } from './schedule';
import type {
  Envelope,
  FeedItem,
  Fix,
  LatLon,
  OobState,
  PingRecord,
  Player,
  Role,
  Settings,
  TeamKeys,
  TeamPubs,
} from './types';

export interface Ctx {
  me: string;
  xsk: string; // my x25519 secret, to open my team keys
  keys: GameKeys;
  cache: Map<string, unknown>; // decrypted inner boxes by event id + field
}

export interface Spot {
  seeker: string;
  target: string;
  at: number;
  pos: LatLon;
  ok?: boolean;
}

export interface GameState {
  hostPk: string | null;
  createdAt: number | null;
  settings: Settings | null;
  players: Record<string, Player>;
  phase: 'lobby' | 'running' | 'ended';
  startAt: number | null;
  teamPubs: TeamPubs | null;
  myKeys: TeamKeys;
  pauses: Pause[];
  caught: Record<string, { by: string; at: number }>;
  pings: PingRecord[]; // pings this phone can see (and the slot numbers of all pings)
  lastFullSlot: Record<string, number>; // newest exact-ping slot received per hider
  sentSlots: number[]; // slots I already pinged (so a restarted phone doesn't resend)
  oob: Record<string, { state: OobState; at: number }>;
  frozenUntil: Record<string, number>;
  spots: Spot[];
  lastSpotAt: Record<string, number>;
  pendingCodes: { hunter: string; target: string; w: number; code: string; at: number }[];
  feed: FeedItem[];
  ended: { at: number; winner: 'hiders' | 'chasers' | 'none'; reason: string } | null;
  sos: { by: string; at: number; pos: LatLon } | null; // last SOS (shown while paused)
}

export function emptyState(): GameState {
  return {
    hostPk: null,
    createdAt: null,
    settings: null,
    players: {},
    phase: 'lobby',
    startAt: null,
    teamPubs: null,
    myKeys: {},
    pauses: [],
    caught: {},
    pings: [],
    lastFullSlot: {},
    sentSlots: [],
    oob: {},
    frozenUntil: {},
    spots: [],
    lastSpotAt: {},
    pendingCodes: [],
    feed: [],
    ended: null,
    sos: null,
  };
}

export const byTime = (a: Envelope, b: Envelope) => a.at - b.at || (a.id < b.id ? -1 : 1);

export function fold(log: Envelope[], ctx: Ctx): GameState {
  const s = emptyState();
  for (const e of log) apply(s, e, ctx);
  return s;
}

const name = (s: GameState, pk: string) => s.players[pk]?.name ?? 'Someone';
const roleOf = (s: GameState, pk: string): Role | null => s.players[pk]?.role ?? null;

export const isPaused = (s: GameState, at: number) =>
  s.pauses.some((p) => p.at <= at && (p.until === undefined || p.until > at));

export function isFrozen(s: GameState, pk: string, at: number) {
  return s.oob[pk]?.state === 'out' || at < (s.frozenUntil[pk] ?? 0);
}

function feed(s: GameState, at: number, text: string, tone: FeedItem['tone'] = 'info') {
  s.feed.push({ at, text, tone });
  if (s.feed.length > 150) s.feed.splice(0, s.feed.length - 150);
}

function cached<T>(ctx: Ctx, key: string, make: () => T | null): T | null {
  if (ctx.cache.has(key)) return ctx.cache.get(key) as T | null;
  const v = make();
  ctx.cache.set(key, v);
  return v;
}

/** Is the hunt live at this moment (started, not paused, past head start, not over)? */
function huntLive(s: GameState, at: number) {
  if (s.phase !== 'running' || !s.startAt || !s.settings) return false;
  if (isPaused(s, at)) return false;
  const gt = gameTime(s.startAt, s.pauses, at);
  return gt >= hideMs(s.settings) && gt < endMs(s.settings);
}

function markCaught(s: GameState, target: string, by: string, at: number) {
  s.caught[target] = { by, at };
  feed(
    s,
    at,
    by ? `🎯 ${name(s, target)} was caught by ${name(s, by)}` : `🏳️ ${name(s, target)} is out`,
    'alert',
  );
  const hiders = Object.values(s.players).filter((p) => p.role === 'hider');
  if (hiders.length && hiders.every((p) => s.caught[p.pk])) {
    s.ended = { at, winner: 'chasers', reason: 'All hiders caught' };
    s.phase = 'ended';
    feed(s, at, '🏆 All hiders caught — Hunters & Seekers win!', 'good');
  }
}

export function apply(s: GameState, e: Envelope, ctx: Ctx): void {
  const { msg, from, at } = e;
  const p = s.players[from];
  if (p) p.lastSeen = Math.max(p.lastSeen, at);

  switch (msg.t) {
    case 'hello': {
      if (p) {
        p.name = msg.name;
        p.color = msg.color;
        p.xpk = msg.xpk;
        p.left = false;
      } else {
        s.players[from] = {
          pk: from,
          xpk: msg.xpk,
          name: msg.name,
          color: msg.color,
          role: null,
          joinedAt: at,
          lastSeen: at,
        };
        feed(s, at, `👋 ${msg.name} joined${s.phase === 'running' ? ' (watching)' : ''}`);
      }
      return;
    }
    case 'bye': {
      if (!p) return;
      p.left = true;
      if (s.phase === 'lobby') p.role = null;
      feed(s, at, `${p.name} left`, 'bad');
      return;
    }
    case 'settings': {
      if (s.phase !== 'lobby') return;
      if (s.hostPk === null) {
        s.hostPk = from;
        s.createdAt = at;
      }
      if (from === s.hostPk) s.settings = msg.settings;
      return;
    }
    case 'roles': {
      if (s.phase !== 'lobby' || from !== s.hostPk) return;
      for (const [pk, role] of Object.entries(msg.roles)) if (s.players[pk]) s.players[pk].role = role;
      return;
    }
    case 'host': {
      if (s.phase !== 'lobby' || !p || msg.pk !== from) return;
      s.hostPk = from;
      feed(s, at, `${p.name} is now the host`);
      return;
    }
    case 'start': {
      if (s.phase !== 'lobby' || from !== s.hostPk) return;
      s.phase = 'running';
      s.startAt = msg.startAt;
      s.settings = msg.settings;
      s.teamPubs = msg.teamPubs;
      for (const pl of Object.values(s.players)) pl.role = msg.roles[pl.pk] ?? null;
      const mine = msg.keys[ctx.me];
      if (mine) s.myKeys = cached<TeamKeys>(ctx, e.id + ':keys', () => openWith(ctx.xsk, mine)) ?? {};
      feed(
        s,
        msg.startAt,
        `🚦 Game on! Hiders have ${msg.settings.headStartMin} min to hide`,
        'good',
      );
      return;
    }
    case 'ping': {
      if (s.phase !== 'running' || roleOf(s, from) !== 'hider' || s.caught[from]) return;
      if (from === ctx.me && msg.slot >= 0 && !s.sentSlots.includes(msg.slot)) s.sentSlots.push(msg.slot);
      const rec: PingRecord = { from, slot: msg.slot, why: msg.why, at, late: msg.late };
      if (msg.exact && s.myKeys.hunter) {
        rec.exact =
          cached<Fix>(ctx, e.id + ':exact', () => openWith(s.myKeys.hunter!, msg.exact!)) ?? undefined;
      }
      if (msg.fuzzy && s.myKeys.chaser) {
        rec.fuzzy =
          cached<PingRecord['fuzzy']>(ctx, e.id + ':fuzzy', () =>
            openWith(s.myKeys.chaser!, msg.fuzzy!),
          ) ?? undefined;
      }
      if (msg.why === 'sched') s.lastFullSlot[from] = Math.max(s.lastFullSlot[from] ?? -1, msg.slot);
      s.pings.push(rec);
      if (msg.why === 'oob') return; // repeats every few seconds; don't spam the feed
      if (msg.why === 'spot') feed(s, at, `📍 ${name(s, from)} revealed by a Spot`, 'alert');
      return;
    }
    case 'oob': {
      if (s.phase !== 'running' || !p?.role) return;
      const prev = s.oob[from]?.state ?? 'in';
      s.oob[from] = { state: msg.state, at };
      const chaser = p.role !== 'hider';
      if (msg.state === 'grace' && prev === 'in') {
        feed(s, at, `⚠️ ${p.name} left the zone`, 'bad');
      } else if (msg.state === 'out') {
        feed(
          s,
          at,
          chaser ? `🧊 ${p.name} is out of bounds — frozen` : `📡 ${p.name} is out of bounds — location revealed`,
          'bad',
        );
      } else if (msg.state === 'in' && prev !== 'in') {
        if (chaser && prev === 'out') s.frozenUntil[from] = at + (s.settings?.freezeSec ?? 60) * 1000;
        feed(s, at, `↩️ ${p.name} is back in the zone`);
      }
      return;
    }
    case 'spot': {
      if (!huntLive(s, at) || roleOf(s, from) !== 'seeker') return;
      if (roleOf(s, msg.target) !== 'hider' || s.caught[msg.target]) return;
      if (isFrozen(s, from, at)) return;
      const cd = (s.settings?.spotCooldownSec ?? 120) * 1000;
      if (at - (s.lastSpotAt[from] ?? -Infinity) < cd) return;
      s.lastSpotAt[from] = at;
      s.spots.push({ seeker: from, target: msg.target, at, pos: { lat: msg.lat, lon: msg.lon } });
      feed(s, at, `👁 ${name(s, from)} spotted ${name(s, msg.target)}!`, 'alert');
      return;
    }
    case 'spotres': {
      const sp = s.spots.find((x) => x.seeker === msg.seeker && x.at === msg.spotAt && x.target === from);
      if (!sp || sp.ok !== undefined) return;
      sp.ok = msg.ok;
      if (!msg.ok) feed(s, at, `❌ ${name(s, sp.seeker)}'s spot on ${name(s, from)} was wrong`);
      return;
    }
    case 'catch': {
      if (!huntLive(s, at) || roleOf(s, from) !== 'hunter') return;
      if (roleOf(s, msg.target) !== 'hider' || s.caught[msg.target]) return;
      if (isFrozen(s, from, at)) return;
      if (Math.abs(msg.w - catchWindow(at)) > 2) return;
      if (msg.sig) {
        if (verifyCatchToken(ctx.keys.gameId, msg.target, msg.w, msg.sig)) markCaught(s, msg.target, from, at);
      } else if (msg.code) {
        s.pendingCodes.push({ hunter: from, target: msg.target, w: msg.w, code: msg.code, at });
      }
      return;
    }
    case 'caught': {
      // The hider's own phone confirming (code catch) or surrendering.
      if (s.phase !== 'running' || roleOf(s, from) !== 'hider' || s.caught[from]) return;
      if (isPaused(s, at)) return;
      const by = roleOf(s, msg.by) === 'hunter' ? msg.by : '';
      markCaught(s, from, by, at);
      return;
    }
    case 'pause': {
      if (s.phase !== 'running' || !p || isPaused(s, at)) return;
      s.pauses.push({ at, by: from });
      feed(
        s,
        at,
        msg.sos ? `🆘 SOS from ${p.name}! Game paused` : `⏸ ${p.name} paused the game`,
        'alert',
      );
      if (msg.sos) s.sos = { by: from, at, pos: msg.sos };
      return;
    }
    case 'resume': {
      const open = s.pauses.find((x) => x.until === undefined);
      if (!open || !p || at < open.at) return;
      open.until = at;
      feed(s, at, `▶️ ${p.name} resumed the game`, 'good');
      return;
    }
    case 'end': {
      if (s.phase !== 'running' || !p) return;
      s.phase = 'ended';
      s.ended = { at, winner: 'none', reason: `Ended by ${p.name}` };
      feed(s, at, `🏁 ${p.name} ended the game`, 'bad');
      return;
    }
    case 'hb':
    case 'pos':
      return; // live-only messages, handled outside the log
  }
}
