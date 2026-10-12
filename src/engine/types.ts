// Shared game types. Everything here is plain data so it can be sent over the
// network, stored, and replayed identically on every phone.

export type Role = 'hider' | 'hunter' | 'seeker';
export type Team = 'hider' | 'chaser' | 'hunter'; // encryption teams (hunter ⊂ chaser)

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Fix extends LatLon {
  acc: number; // metres
  t: number; // ms epoch
  speed?: number | null; // m/s
}

export type Zone =
  | { kind: 'circle'; center: LatLon; radius: number }
  | { kind: 'polygon'; points: LatLon[] };

export interface Settings {
  zone: Zone;
  headStartMin: number; // hiders' head start before the hunt begins
  durationMin: number; // hunt length after the head start
  pingEveryMin: number; // starting exact-ping interval
  accelerate: boolean; // pings get faster as the hunt goes on
  fuzzRadiusM: number; // size of the seekers' rough circle
  spotRangeM: number; // a seeker must be this close for a Spot to count
  spotCooldownSec: number;
  graceSec: number; // time to get back inside the zone before a penalty
  freezeSec: number; // chaser freeze after returning from out of bounds
}

export const DEFAULT_SETTINGS: Omit<Settings, 'zone'> = {
  headStartMin: 10,
  durationMin: 60,
  pingEveryMin: 5,
  accelerate: true,
  fuzzRadiusM: 250,
  spotRangeM: 150,
  spotCooldownSec: 120,
  graceSec: 30,
  freezeSec: 60,
};

export interface Player {
  pk: string; // nostr pubkey (hex) — the player's identity
  xpk: string; // x25519 pubkey (hex) for receiving team keys
  name: string;
  color: string;
  role: Role | null;
  joinedAt: number;
  lastSeen: number;
  left?: boolean;
}

export type TeamKeys = Partial<Record<Team, string>>; // team -> x25519 secret (hex)
export type TeamPubs = Record<Team, string>; // team -> x25519 pubkey (hex)

// ---------- wire messages (the decrypted payload of each network event) ----------

export type Sealed = string; // base64 box only a team can open

export type Msg =
  | { t: 'hello'; name: string; color: string; xpk: string }
  | { t: 'hb' }
  | { t: 'bye' }
  | { t: 'settings'; settings: Settings }
  | { t: 'roles'; roles: Record<string, Role | null> }
  | { t: 'host'; pk: string }
  | {
      t: 'start';
      startAt: number;
      settings: Settings;
      roles: Record<string, Role>;
      teamPubs: TeamPubs;
      keys: Record<string, Sealed>; // pk -> sealed TeamKeys
    }
  | { t: 'pos'; team: Team; box: Sealed }
  | { t: 'ping'; slot: number; why: PingWhy; late?: boolean; exact?: Sealed; fuzzy?: Sealed }
  | { t: 'oob'; state: OobState }
  | { t: 'spot'; target: string; lat: number; lon: number }
  | { t: 'spotres'; seeker: string; spotAt: number; ok: boolean }
  | { t: 'catch'; target: string; w: number; sig?: string; code?: string }
  | { t: 'caught'; by: string }
  | { t: 'pause'; sos?: LatLon; reason?: string }
  | { t: 'resume' }
  | { t: 'end'; reason: string };

export type PingWhy = 'sched' | 'mid' | 'spot' | 'oob';
export type OobState = 'in' | 'grace' | 'out';

/** A message after decoding, with its author and send time. */
export interface Envelope {
  id: string; // network event id
  from: string; // author pubkey
  at: number; // ms epoch (sender clock)
  msg: Msg;
  /** Inner sealed payloads this phone could open, keyed by field name. */
  opened?: Record<string, unknown>;
}

export interface PingRecord {
  from: string;
  slot: number;
  why: PingWhy;
  at: number;
  late?: boolean;
  exact?: Fix; // only present if this phone may see exact pings
  fuzzy?: { center: LatLon; radius: number };
}

export interface FeedItem {
  at: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'alert';
}
