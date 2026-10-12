// Talks to several public Nostr relays at once. No relay is special: every
// message goes to all of them, and each relay has its own outbox, so a relay
// that is down or rate-limiting just catches up later. Messages are already
// encrypted before they get here.

import { AbstractRelay } from 'nostr-tools/abstract-relay';
import type { Event } from 'nostr-tools/core';

export const KIND_LOG = 7461; // stored: game history (joins, pings, catches…)
export const KIND_LIVE = 27461; // ephemeral: live positions & heartbeats

export const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.snort.social',
  'wss://relay.damus.io',
  'wss://nostr.oxtr.dev',
];

export type RelayStatus = 'connecting' | 'online' | 'offline' | 'cooldown';

export interface RelayInfo {
  url: string;
  status: RelayStatus;
  queued: number;
}

interface Queued {
  ev: Event;
  expires: number; // drop if still unsent after this (live messages go stale)
}

const SEND_GAP_MS = 1100; // per relay — some relays ban faster senders
const LIVE_TTL_MS = 30_000;
const RECONNECT_MS = [1000, 3000, 6000, 15000, 30000];

class RelayConn {
  status: RelayStatus = 'offline';
  private relay?: AbstractRelay;
  private queue: Queued[] = [];
  private lastSend = 0;
  private cooldownUntil = 0;
  private attempts = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private pumping = false;
  private dead = false;

  constructor(
    readonly url: string,
    private pool: RelayPool,
  ) {}

  get queued() {
    return this.queue.length;
  }

  async connect() {
    if (this.dead || this.status === 'connecting' || this.status === 'online') return;
    this.setStatus('connecting');
    const r = new AbstractRelay(this.url, { verifyEvent: () => true, enableReconnect: false });
    try {
      await r.connect({ timeout: 8000 });
    } catch {
      this.setStatus('offline');
      this.scheduleReconnect();
      return;
    }
    if (this.dead) return r.close();
    this.relay = r;
    this.attempts = 0;
    r.onclose = () => {
      if (this.relay !== r) return;
      this.relay = undefined;
      this.setStatus('offline');
      this.scheduleReconnect();
    };
    this.setStatus(Date.now() < this.cooldownUntil ? 'cooldown' : 'online');
    this.subscribe(r);
    this.pump();
  }

  private scheduleReconnect() {
    if (this.dead) return;
    clearTimeout(this.timer);
    const wait = RECONNECT_MS[Math.min(this.attempts++, RECONNECT_MS.length - 1)];
    this.timer = setTimeout(() => this.connect(), wait);
  }

  /** Try to reconnect right away (e.g. app came back to the foreground). */
  kick() {
    if (this.status === 'offline') {
      this.attempts = 0;
      clearTimeout(this.timer);
      this.connect();
    }
  }

  private subscribe(r: AbstractRelay) {
    const tag = this.pool.tag;
    // Live feed first so nothing slips through while history loads.
    const live = r.subscribe(
      [{ kinds: [KIND_LOG, KIND_LIVE], '#g': [tag], since: Math.floor(Date.now() / 1000) - 10 }],
      {
        onevent: (ev) => this.pool.receive(ev),
        onclose: (reason) => {
          // Relay dropped our subscription but kept the socket: resubscribe.
          if (this.relay === r && !this.dead && r.connected) {
            setTimeout(() => this.relay === r && this.subscribe(r), 5000);
          }
          void reason;
        },
      },
    );
    void live;
    this.fetchHistory(r);
  }

  /** Page backwards through stored history (relays cap how many they return). */
  private async fetchHistory(r: AbstractRelay) {
    let until: number | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 40; page++) {
      const events = await new Promise<Event[]>((resolve) => {
        const got: Event[] = [];
        const filter: Record<string, unknown> = {
          kinds: [KIND_LOG],
          '#g': [this.pool.tag],
          since: this.pool.since,
          limit: 500,
        };
        if (until !== undefined) filter.until = until;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          sub.close();
          resolve(got);
        };
        const sub = r.subscribe([filter as never], {
          onevent: (ev) => got.push(ev),
          oneose: finish,
          onclose: finish,
        });
        setTimeout(finish, 10_000);
      });
      let fresh = 0;
      let oldest = Infinity;
      for (const ev of events) {
        oldest = Math.min(oldest, ev.created_at);
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        fresh++;
        this.pool.receive(ev);
      }
      if (fresh === 0 || this.relay !== r) return;
      until = oldest;
    }
  }

  enqueue(ev: Event, live: boolean) {
    this.queue.push({ ev, expires: live ? Date.now() + LIVE_TTL_MS : Infinity });
    if (this.queue.length > 800) {
      const i = this.queue.findIndex((q) => q.expires !== Infinity);
      this.queue.splice(i >= 0 ? i : 0, 1);
    }
    this.pump();
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length && this.relay?.connected && !this.dead) {
        const now = Date.now();
        if (now < this.cooldownUntil) {
          this.setStatus('cooldown');
          await sleep(this.cooldownUntil - now);
          continue;
        }
        if (this.status === 'cooldown') this.setStatus('online');
        const gap = this.lastSend + SEND_GAP_MS - now;
        if (gap > 0) await sleep(gap);
        const item = this.queue[0];
        if (item.expires < Date.now()) {
          this.queue.shift();
          continue;
        }
        this.lastSend = Date.now();
        try {
          await this.relay.publish(item.ev);
          this.queue.shift();
        } catch (e) {
          const reason = String((e as Error)?.message ?? e).toLowerCase();
          if (reason.includes('duplicate')) this.queue.shift();
          else if (reason.includes('rate') || reason.includes('banned') || reason.includes('slow down')) {
            this.cooldownUntil = Date.now() + 60_000;
          } else if (!this.relay?.connected || reason.includes('timed out') || reason.includes('closed')) {
            break; // keep it queued; reconnect will resume
          } else {
            this.queue.shift(); // relay refuses this event for good (policy, size…)
          }
        }
        this.pool.changed();
      }
    } finally {
      this.pumping = false;
    }
  }

  private setStatus(s: RelayStatus) {
    if (this.status !== s) {
      this.status = s;
      this.pool.changed();
    }
  }

  close() {
    this.dead = true;
    clearTimeout(this.timer);
    try {
      this.relay?.close();
    } catch {}
    this.relay = undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RelayPool {
  private conns: RelayConn[];
  private seen = new Set<string>();
  private statusTimer?: ReturnType<typeof setTimeout>;

  constructor(
    urls: string[],
    readonly tag: string,
    readonly since: number, // unix seconds — ignore anything older
    private onEvent: (ev: Event) => void,
    private onStatus: () => void,
  ) {
    this.conns = urls.map((u) => new RelayConn(u, this));
  }

  start() {
    for (const c of this.conns) c.connect();
  }

  kick() {
    for (const c of this.conns) c.kick();
  }

  publish(ev: Event, live: boolean) {
    this.seen.add(ev.id);
    for (const c of this.conns) c.enqueue(ev, live);
  }

  receive(ev: Event) {
    if (this.seen.has(ev.id)) return;
    this.seen.add(ev.id);
    this.onEvent(ev);
  }

  changed() {
    if (this.statusTimer) return;
    this.statusTimer = setTimeout(() => {
      this.statusTimer = undefined;
      this.onStatus();
    }, 250);
  }

  info(): RelayInfo[] {
    return this.conns.map((c) => ({ url: c.url, status: c.status, queued: c.queued }));
  }

  online(): number {
    return this.conns.filter((c) => c.status === 'online' || c.status === 'cooldown').length;
  }

  close() {
    for (const c of this.conns) c.close();
    clearTimeout(this.statusTimer);
  }
}
