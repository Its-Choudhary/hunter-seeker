// One player's running copy of the game. Every phone runs exactly this; there
// is no server and no special phone once the game has started.
//
// It owns: the message log, the derived state, this player's GPS fix, and the
// automatic duties of each role (hiders ping on schedule, answer spots, leave
// the zone → penalties, etc.).

import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import type { Event } from 'nostr-tools/core';

import {
  type GameKeys,
  bytesToHex,
  catchCode,
  catchWindow,
  decryptMaster,
  deriveGame,
  encodeCatchQr,
  encryptMaster,
  hexToBytes,
  newX25519,
  openWith,
  parseCatchQr,
  randomBytes,
  sealTo,
  secureRandom,
  signCatchToken,
} from './crypto';
import { distance, edgeDistance, randomInDisc } from './geo';
import { type Ctx, type GameState, apply, byTime, emptyState, fold, isPaused } from './reducer';
import { type Slot, endMs, gameTime, lastSlot, phaseAt, pingSlots } from './schedule';
import { DEFAULT_RELAYS, KIND_LIVE, KIND_LOG, RelayPool } from './transport';
import type {
  Envelope,
  Fix,
  Msg,
  OobState,
  Role,
  Settings,
  Team,
  TeamKeys,
} from './types';

export interface Identity {
  sk: string; // nostr secret (hex)
  pk: string;
  xsk: string; // x25519 secret (hex)
  xpk: string;
  name: string;
  color: string;
}

export function newIdentity(name: string, color: string): Identity {
  const sk = randomBytes(32);
  const x = newX25519();
  return { sk: bytesToHex(sk), pk: getPublicKey(sk), xsk: x.priv, xpk: x.pub, name, color };
}

export interface LivePos extends Fix {
  team: Team;
}

const LIVE_KINDS = new Set(['hb', 'pos']);
const POS_EVERY_MS = 15_000;
const HB_EVERY_MS = 20_000;
const OOB_PING_EVERY_MS = 20_000;

export class Session {
  readonly keys: GameKeys;
  readonly ctx: Ctx;
  state: GameState = emptyState();
  log: Envelope[] = [];
  live: { positions: Record<string, LivePos>; lastSeen: Record<string, number> } = {
    positions: {},
    lastSeen: {},
  };
  fix: Fix | null = null;
  /** Where my own pings were sent from (hiders can't decrypt their own exact pings). */
  myPings: (Fix & { why: string })[] = [];
  version = 0;

  private pool: RelayPool;
  private sk: Uint8Array;
  private listeners = new Set<() => void>();
  private tickTimer?: ReturnType<typeof setInterval>;
  private emitTimer?: ReturnType<typeof setTimeout>;
  private slotsCache?: { settings: Settings; slots: Slot[] };
  private lastPos = 0;
  private lastHb = 0;
  private lastOobPing = 0;
  private sentLocal = new Set<number>();
  private handled = new Set<string>();
  private oobLocal = { state: 'in' as OobState, out: 0, in: 0, since: 0 };
  private pending: Envelope[] = [];
  private overAnnounced = false;
  private flushTimer?: ReturnType<typeof setTimeout>;

  constructor(
    secret: Uint8Array,
    readonly me: Identity,
    relays: string[] = DEFAULT_RELAYS,
    /** Only fetch history newer than this (unix ms). */
    since = Date.now() - 12 * 3600_000,
  ) {
    this.keys = deriveGame(secret);
    this.sk = hexToBytes(me.sk);
    this.ctx = { me: me.pk, xsk: me.xsk, keys: this.keys, cache: new Map() };
    this.pool = new RelayPool(
      relays,
      this.keys.tag,
      Math.floor(since / 1000),
      (ev) => this.receive(ev),
      () => this.emit(),
    );
  }

  // ---------- lifecycle ----------

  start(createWith?: Settings) {
    this.pool.start();
    this.hello();
    if (createWith) this.send({ t: 'settings', settings: createWith });
    this.tickTimer = setInterval(() => this.tick(), 1000);
  }

  stop() {
    clearInterval(this.tickTimer);
    clearTimeout(this.emitTimer);
    clearTimeout(this.flushTimer);
    this.pool.close();
    this.listeners.clear();
  }

  /** Call when the app returns to the foreground or the network comes back. */
  wake() {
    this.pool.kick();
    this.tick();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = undefined;
      this.version++;
      for (const fn of this.listeners) fn();
    }, 30);
  }

  relays() {
    return this.pool.info();
  }

  relaysOnline() {
    return this.pool.online();
  }

  // ---------- sending & receiving ----------

  private send(msg: Msg) {
    const at = Date.now();
    const live = LIVE_KINDS.has(msg.t);
    const ev = finalizeEvent(
      {
        kind: live ? KIND_LIVE : KIND_LOG,
        created_at: Math.floor(at / 1000),
        tags: [['g', this.keys.tag]],
        content: encryptMaster(this.keys, { at, m: msg }),
      },
      this.sk,
    );
    this.pool.publish(ev, live);
    this.ingest({ id: ev.id, from: this.me.pk, at, msg }, live);
  }

  private receive(ev: Event) {
    const payload = decryptMaster<{ at: number; m: Msg }>(this.keys, ev.content);
    if (!payload || typeof payload.at !== 'number' || !payload.m?.t) return;
    this.ingest({ id: ev.id, from: ev.pubkey, at: payload.at, msg: payload.m }, ev.kind === KIND_LIVE);
  }

  private ingest(env: Envelope, live: boolean) {
    this.live.lastSeen[env.from] = Math.max(this.live.lastSeen[env.from] ?? 0, env.at);
    if (live) {
      if (env.msg.t === 'pos') {
        const key = this.state.myKeys[env.msg.team];
        const fix = key ? openWith<Fix>(key, env.msg.box) : null;
        if (fix) this.live.positions[env.from] = { ...fix, team: env.msg.team };
      }
      this.emit();
      return;
    }
    if (env.from === this.me.pk && env.msg.t === 'oob' && env.at > this.oobLocal.since) {
      // Restored from history after a restart (relays send newest first, so
      // only a newer message may change it): carry on from where we were.
      this.oobLocal = { state: env.msg.state, out: 0, in: 0, since: env.at };
    }
    // Batch arrivals (history comes in bursts, newest first) and fold once.
    this.pending.push(env);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 20);
  }

  private flush() {
    this.flushTimer = undefined;
    const batch = this.pending.sort(byTime);
    this.pending = [];
    if (!batch.length) return;
    const last = this.log[this.log.length - 1];
    if (!last || byTime(last, batch[0]) < 0) {
      for (const e of batch) {
        this.log.push(e);
        apply(this.state, e, this.ctx);
      }
    } else {
      // Some arrived out of order: insert and replay so every phone agrees.
      this.log.push(...batch);
      this.log.sort(byTime);
      this.state = fold(this.log, this.ctx);
    }
    this.react();
    this.emit();
  }

  // ---------- derived helpers ----------

  get settings() {
    return this.state.settings;
  }

  get role(): Role | null {
    return this.state.players[this.me.pk]?.role ?? null;
  }

  get isHost() {
    return this.state.hostPk === this.me.pk;
  }

  slots(): Slot[] {
    const s = this.state.settings!;
    if (this.slotsCache?.settings !== s) this.slotsCache = { settings: s, slots: pingSlots(s) };
    return this.slotsCache.slots;
  }

  gameTime(now = Date.now()) {
    return this.state.startAt ? gameTime(this.state.startAt, this.state.pauses, now) : 0;
  }

  /** 'lobby' | 'starting' | 'hiding' | 'hunting' | 'over' */
  phase(now = Date.now()) {
    const s = this.state;
    if (s.phase === 'lobby') return 'lobby' as const;
    if (s.phase === 'ended') return 'over' as const;
    if (now < s.startAt!) return 'starting' as const;
    return phaseAt(s.settings!, this.gameTime(now));
  }

  paused(now = Date.now()) {
    return isPaused(this.state, now);
  }

  // ---------- the automatic duties, run every second ----------

  private tick() {
    const now = Date.now();
    const s = this.state;
    if (s.phase === 'lobby') {
      if (now - this.lastHb > HB_EVERY_MS) {
        this.lastHb = now;
        this.send({ t: 'hb' });
      }
      return;
    }
    if (s.phase !== 'running') return;

    const phase = this.phase(now);
    if (phase === 'over') {
      // Time ran out: no message marks this, so tell listeners once.
      if (!this.overAnnounced) {
        this.overAnnounced = true;
        this.emit();
      }
      return;
    }
    const team = this.myTeam();
    if (team && this.fix && now - this.lastPos > POS_EVERY_MS && s.teamPubs) {
      this.lastPos = this.lastHb = now;
      this.send({ t: 'pos', team, box: sealTo(s.teamPubs[team], this.fix) });
    } else if (now - this.lastHb > HB_EVERY_MS) {
      this.lastHb = now;
      this.send({ t: 'hb' });
    }
    if (phase === 'starting' || this.paused(now)) return;

    this.checkZoneTimers(now);
    if (this.role === 'hider' && !s.caught[this.me.pk]) this.hiderDuties(now, phase);
    this.emit(); // clocks move
  }

  private myTeam(): Team | null {
    const r = this.role;
    if (r === 'hider' && !this.state.caught[this.me.pk]) return 'hider';
    if (r === 'hunter' || r === 'seeker') return 'chaser';
    return null;
  }

  private hiderDuties(now: number, phase: string) {
    const s = this.state;
    if (phase !== 'hunting' || !this.fix || !s.teamPubs || !s.settings) return;
    const gt = this.gameTime(now);
    const due = lastSlot(this.slots(), gt);
    if (due && !this.sentLocal.has(due.i) && !s.sentSlots.includes(due.i)) {
      this.sentLocal.add(due.i);
      this.sendPing(due.i, due.full ? 'sched' : 'mid', due.full, gt - due.gt > 20_000);
    }
    if (this.oobLocal.state === 'out' && now - this.lastOobPing > OOB_PING_EVERY_MS) {
      this.lastOobPing = now;
      this.sendPing(-1, 'oob', true);
    }
  }

  private sendPing(slot: number, why: 'sched' | 'mid' | 'spot' | 'oob', exact: boolean, late = false) {
    const s = this.state;
    if (!this.fix || !s.teamPubs || !s.settings) return;
    const r = s.settings.fuzzRadiusM;
    const fuzzy = { center: randomInDisc(this.fix, r * 0.8, secureRandom), radius: r };
    if (exact) this.myPings.push({ ...this.fix, t: Date.now(), why });
    this.send({
      t: 'ping',
      slot,
      why,
      late: late || undefined,
      exact: exact ? sealTo(s.teamPubs.hunter, this.fix) : undefined,
      fuzzy: sealTo(s.teamPubs.chaser, fuzzy),
    });
  }

  /** Reactions to other players' messages that need this phone's secrets. */
  private react() {
    const s = this.state;
    if (s.phase !== 'running' || this.role !== 'hider' || s.caught[this.me.pk]) return;
    const now = Date.now();
    // Someone typed my 6-digit code: check it with my secret key and confirm.
    for (const c of s.pendingCodes) {
      const key = `code:${c.hunter}:${c.at}`;
      if (c.target !== this.me.pk || this.handled.has(key)) continue;
      this.handled.add(key);
      const ok = [c.w - 1, c.w, c.w + 1].some((w) => catchCode(this.sk, this.keys.gameId, w) === c.code);
      if (ok) {
        this.send({ t: 'caught', by: c.hunter });
        return;
      }
    }
    // A seeker says they can see me: if they're really close, reveal me.
    for (const sp of s.spots) {
      const key = `spot:${sp.seeker}:${sp.at}`;
      if (sp.target !== this.me.pk || sp.ok !== undefined || this.handled.has(key)) continue;
      this.handled.add(key);
      const range = (s.settings?.spotRangeM ?? 150) + Math.min(this.fix?.acc ?? 0, 50);
      const ok = !!this.fix && now - sp.at < 120_000 && distance(this.fix, sp.pos) <= range;
      if (ok) this.sendPing(-1, 'spot', true);
      this.send({ t: 'spotres', seeker: sp.seeker, spotAt: sp.at, ok });
    }
  }

  // ---------- GPS & the zone ----------

  setFix(fix: Fix) {
    this.fix = fix;
    const s = this.state;
    if (s.phase === 'running' && s.settings && !this.paused()) {
      const ph = this.phase();
      const active = (ph === 'hiding' || ph === 'hunting') && !!this.role && !s.caught[this.me.pk];
      if (active) this.checkZone(fix);
    }
    this.emit();
  }

  /** Signed distance to the zone edge (negative = inside). */
  edge(): number | null {
    if (!this.fix || !this.state.settings) return null;
    return edgeDistance(this.state.settings.zone, this.fix);
  }

  oobState(): OobState {
    return this.oobLocal.state;
  }

  graceLeft(now = Date.now()) {
    if (this.oobLocal.state !== 'grace' || !this.state.settings) return 0;
    return this.oobLocal.since + this.state.settings.graceSec * 1000 - now;
  }

  private checkZone(fix: Fix) {
    const zone = this.state.settings!.zone;
    const d = edgeDistance(zone, fix);
    const tol = Math.max(10, fix.acc * 0.5); // GPS jitter allowance
    const o = this.oobLocal;
    if (d > tol) {
      o.out++;
      o.in = 0;
    } else if (d < 0) {
      o.in++;
      o.out = 0;
    }
    if (o.state === 'in' && o.out >= 3) this.setOob('grace');
    else if (o.state !== 'in' && o.in >= 2) this.setOob('in');
  }

  private checkZoneTimers(now: number) {
    if (this.oobLocal.state === 'grace' && this.graceLeft(now) <= 0) {
      this.setOob('out');
      if (this.role === 'hider') {
        this.lastOobPing = now;
        this.sendPing(-1, 'oob', true);
      }
    }
  }

  private setOob(state: OobState) {
    this.oobLocal = { state, out: 0, in: 0, since: Date.now() - 1 };
    this.send({ t: 'oob', state });
  }

  // ---------- player actions ----------

  hello() {
    this.send({ t: 'hello', name: this.me.name, color: this.me.color, xpk: this.me.xpk });
  }

  rename(name: string, color: string) {
    this.me.name = name;
    this.me.color = color;
    this.hello();
  }

  setSettings(settings: Settings) {
    if (this.isHost) this.send({ t: 'settings', settings });
  }

  setRoles(roles: Record<string, Role | null>) {
    if (this.isHost) this.send({ t: 'roles', roles });
  }

  takeHost() {
    this.send({ t: 'host', pk: this.me.pk });
  }

  /** Host only. Returns an error message if the game can't start yet. */
  startGame(): string | null {
    const s = this.state;
    if (!this.isHost || s.phase !== 'lobby' || !s.settings) return 'Only the host can start';
    const present = Object.values(s.players).filter((p) => !p.left);
    const roles: Record<string, Role> = {};
    for (const p of present) if (p.role) roles[p.pk] = p.role;
    const count = (r: Role) => Object.values(roles).filter((x) => x === r).length;
    if (count('hider') < 1) return 'Need at least one hider';
    if (count('hunter') < 1) return 'Need at least one hunter';

    const team = { hider: newX25519(), chaser: newX25519(), hunter: newX25519() };
    const keys: Record<string, string> = {};
    for (const p of present) {
      const r = roles[p.pk];
      const k: TeamKeys =
        r === 'hider'
          ? { hider: team.hider.priv }
          : r === 'hunter'
            ? { chaser: team.chaser.priv, hunter: team.hunter.priv }
            : r === 'seeker'
              ? { chaser: team.chaser.priv }
              : { hider: team.hider.priv, chaser: team.chaser.priv, hunter: team.hunter.priv }; // referee
      keys[p.pk] = sealTo(p.xpk, k);
    }
    this.send({
      t: 'start',
      startAt: Date.now() + 5000,
      settings: s.settings,
      roles,
      teamPubs: { hider: team.hider.pub, chaser: team.chaser.pub, hunter: team.hunter.pub },
      keys,
    });
    return null;
  }

  /** What my catch QR shows right now (hider). */
  catchQr(now = Date.now()) {
    const w = catchWindow(now);
    return encodeCatchQr({
      g: this.keys.gameId,
      p: this.me.pk,
      w,
      s: signCatchToken(this.sk, this.keys.gameId, this.me.pk, w),
    });
  }

  catchCode(now = Date.now()) {
    return catchCode(this.sk, this.keys.gameId, catchWindow(now));
  }

  /** Hunter scanned a QR. Returns an error message or null on success. */
  catchFromQr(text: string): string | null {
    const q = parseCatchQr(text);
    if (!q) return "That's not a Hunter Seeker catch code";
    if (q.g !== this.keys.gameId) return 'That code is from a different game';
    const target = this.state.players[q.p];
    if (!target || target.role !== 'hider') return "That player isn't a hider";
    if (this.state.caught[q.p]) return `${target.name} is already caught`;
    if (Math.abs(q.w - catchWindow(Date.now())) > 2) return 'Code expired — scan the live screen';
    const err = this.canAct();
    if (err) return err;
    this.send({ t: 'catch', target: q.p, w: q.w, sig: q.s });
    return null;
  }

  catchWithCode(target: string, code: string): string | null {
    const err = this.canAct();
    if (err) return err;
    if (!/^\d{6}$/.test(code)) return 'Enter the 6-digit code';
    this.send({ t: 'catch', target, w: catchWindow(Date.now()), code });
    return null;
  }

  spot(target: string): string | null {
    const err = this.canAct();
    if (err) return err;
    if (!this.fix) return 'Waiting for your GPS';
    const s = this.state;
    const cd = (s.settings?.spotCooldownSec ?? 120) * 1000;
    const left = (s.lastSpotAt[this.me.pk] ?? -Infinity) + cd - Date.now();
    if (left > 0) return `Spot recharging — ${Math.ceil(left / 1000)}s`;
    this.send({ t: 'spot', target, lat: this.fix.lat, lon: this.fix.lon });
    return null;
  }

  private canAct(): string | null {
    const now = Date.now();
    if (this.paused(now)) return 'Game is paused';
    if (this.phase(now) !== 'hunting') return 'The hunt has not started';
    if (this.oobLocal.state === 'out' || now < (this.state.frozenUntil[this.me.pk] ?? 0)) {
      return "You're frozen for leaving the zone";
    }
    return null;
  }

  surrender() {
    this.send({ t: 'caught', by: '' });
  }

  pause(sos = false) {
    this.send({
      t: 'pause',
      sos: sos && this.fix ? { lat: this.fix.lat, lon: this.fix.lon } : undefined,
    });
  }

  resume() {
    this.send({ t: 'resume' });
  }

  endGame() {
    this.send({ t: 'end', reason: 'manual' });
  }

  leave() {
    this.send({ t: 'bye' });
  }

  // ---------- views ----------

  /** Hiders whose scheduled ping is overdue (phone off / no signal). */
  darkHiders(now = Date.now()): string[] {
    const s = this.state;
    if (s.phase !== 'running' || this.phase(now) !== 'hunting' || this.paused(now)) return [];
    const gt = this.gameTime(now);
    const due = lastSlot(this.slots(), gt - 60_000, true);
    if (!due) return [];
    return Object.values(s.players)
      .filter((p) => p.role === 'hider' && !s.caught[p.pk] && (s.lastFullSlot[p.pk] ?? -1) < due.i)
      .map((p) => p.pk);
  }

  /** Time left in the game (ms of play), or 0. */
  timeLeft(now = Date.now()) {
    if (!this.state.settings || !this.state.startAt) return 0;
    return Math.max(0, endMs(this.state.settings) - this.gameTime(now));
  }

  /** The final result once the game is over (all caught, ended, or time up). */
  outcome(now = Date.now()) {
    const s = this.state;
    if (s.ended) return s.ended;
    if (s.phase === 'running' && s.settings && this.gameTime(now) >= endMs(s.settings)) {
      return { at: now, winner: 'hiders' as const, reason: 'Time up — hiders survived!' };
    }
    return null;
  }
}
