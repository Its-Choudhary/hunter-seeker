// Fake players that walk around and play a real game over the real relays.
//
//   Full bot game (fast settings), prints a consistency report at the end:
//     npx tsx scripts/bots.mts --create --hiders 3 --hunters 2 --seekers 1
//
//   Join a game you created in the app (you are host and assign roles there):
//     npx tsx scripts/bots.mts --join HS1.xxxxx --hiders 2 --hunters 1
//
// Options: --lat --lon (zone centre), --radius m, --minutes (hunt length),
//          --rogue (one chaser wanders out of the zone), --verbose

import { Session, newIdentity } from '../src/engine/session.ts';
import { encodeJoinCode, newGameSecret, parseJoinCode } from '../src/engine/crypto.ts';
import { distance, edgeDistance, offset, randomInDisc, zoneCenter } from '../src/engine/geo.ts';
import { DEFAULT_SETTINGS, type Fix, type LatLon, type Role, type Settings } from '../src/engine/types.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? 'true' : args[i + 1]) : d;
};
const center: LatLon = { lat: Number(opt('lat', '26.2934')), lon: Number(opt('lon', '73.0243')) };
const radius = Number(opt('radius', '350'));
const verbose = !!opt('verbose');
const want: Role[] = [
  ...Array(Number(opt('hiders', '0'))).fill('hider'),
  ...Array(Number(opt('hunters', '0'))).fill('hunter'),
  ...Array(Number(opt('seekers', '0'))).fill('seeker'),
];
const NAMES: Record<Role, string[]> = {
  hider: ['Priya', 'Kabir', 'Meera', 'Arjun', 'Isha', 'Dev'],
  hunter: ['Aman', 'Rohit', 'Vikram', 'Sana'],
  seeker: ['Rahul', 'Neha', 'Tara'],
};
const COLORS = ['#22c55e', '#06b6d4', '#a855f7', '#f97316', '#ec4899', '#eab308'];

interface Bot {
  role: Role;
  s: Session;
  pos: LatLon;
  heading: number;
  rogueUntil?: number;
}

const createMode = !!opt('create');
const secret = createMode ? newGameSecret() : parseJoinCode(opt('join', '')!);
if (!secret) throw new Error('Pass --create or --join <code>');
const minutes = Number(opt('minutes', '3'));

const testSettings: Settings = {
  ...DEFAULT_SETTINGS,
  zone: { kind: 'circle', center, radius },
  headStartMin: 0.25,
  durationMin: minutes,
  pingEveryMin: 0.5,
  accelerate: false,
  spotCooldownSec: 40,
  graceSec: 10,
  freezeSec: 15,
};

const bots: Bot[] = [];
const used: Record<string, number> = {};
want.forEach((role, i) => {
  const n = used[role] = (used[role] ?? 0) + 1;
  const id = newIdentity(`${NAMES[role][(n - 1) % NAMES[role].length]} 🤖`, COLORS[i % COLORS.length]);
  const s = new Session(secret, id);
  const pos = role === 'hider' ? randomInDisc(center, radius * 0.6, Math.random) : offset(center, -radius * 0.2, 0);
  bots.push({ role, s, pos, heading: Math.random() * 360 });
});

const host = createMode ? bots[0] : undefined;
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(3)}s]`, ...a);

if (createMode) {
  log('JOIN CODE:', encodeJoinCode(secret));
  host!.s.start(testSettings);
  setTimeout(() => bots.slice(1).forEach((b) => b.s.start()), 1500);
} else {
  bots.forEach((b) => b.s.start());
}

const seenFeed = new Set<string>();
function printFeed() {
  const s = (host ?? bots[0]).s;
  for (const f of s.state.feed) {
    const k = f.at + f.text;
    if (seenFeed.has(k)) continue;
    seenFeed.add(k);
    log('FEED', f.text);
  }
}

// Host assigns roles once everyone has said hello, then starts.
let started = false;
let rolesSent = false;
function hostDuties() {
  if (!host || started) return;
  const st = host.s.state;
  const all = bots.every((b) => st.players[b.s.me.pk]);
  if (!all) return;
  if (!rolesSent) {
    rolesSent = true;
    host.s.setRoles(Object.fromEntries(bots.map((b) => [b.s.me.pk, b.role])));
    log('roles assigned');
    return;
  }
  const rolesSeen = bots.every((b) => bots.every((o) => b.s.state.players[o.s.me.pk]?.role === o.role));
  if (rolesSeen) {
    const err = host.s.startGame();
    log(err ? 'start failed: ' + err : 'START');
    started = !err;
  }
}

function step(b: Bot, dt: number) {
  const zone = b.s.settings?.zone ?? testSettings.zone;
  const phase = b.s.phase();
  let speed = 0;
  let target: LatLon | null = null;
  if (b.role === 'hider') {
    speed = b.s.state.caught[b.s.me.pk] ? 0 : 1.3;
  } else if (phase === 'hunting') {
    speed = b.role === 'hunter' ? 2.6 : 2.0;
    if (b.role === 'hunter') {
      // Head for the freshest exact ping of an uncaught hider.
      const p = [...b.s.state.pings].reverse().find((x) => x.exact && !b.s.state.caught[x.from]);
      if (p?.exact) target = p.exact;
    } else {
      // Seekers sweep toward the freshest rough circle.
      const p = [...b.s.state.pings].reverse().find((x) => x.fuzzy && !b.s.state.caught[x.from]);
      if (p?.fuzzy) target = p.fuzzy.center;
    }
  }
  if (b.rogueUntil && Date.now() < b.rogueUntil) {
    target = offset(zoneCenter(zone), radius + 150, 0);
    speed = 15;
  }
  if (target && distance(b.pos, target) > 5) {
    const d = distance(b.pos, target);
    const k = Math.min(1, (speed * dt) / d);
    b.pos = { lat: b.pos.lat + (target.lat - b.pos.lat) * k, lon: b.pos.lon + (target.lon - b.pos.lon) * k };
  } else if (speed) {
    b.heading += (Math.random() - 0.5) * 40;
    const rad = (b.heading * Math.PI) / 180;
    const next = offset(b.pos, Math.cos(rad) * speed * dt, Math.sin(rad) * speed * dt);
    if (edgeDistance(zone, next) > -20) b.heading += 180;
    else b.pos = next;
  }
  const fix: Fix = { ...b.pos, acc: 8, t: Date.now() };
  b.s.setFix(fix);
}

function interactions() {
  for (const h of bots.filter((b) => b.role === 'hunter')) {
    for (const v of bots.filter((b) => b.role === 'hider' && !h.s.state.caught[b.s.me.pk])) {
      if (distance(h.pos, v.pos) < 25) {
        const useCode = Math.random() < 0.4;
        const err = useCode
          ? h.s.catchWithCode(v.s.me.pk, v.s.catchCode())
          : h.s.catchFromQr(v.s.catchQr());
        if (!err) log(`${h.s.me.name} catches ${v.s.me.name} via ${useCode ? '6-digit code' : 'QR'}`);
        else if (verbose) log('catch refused:', err);
      }
    }
  }
  for (const sk of bots.filter((b) => b.role === 'seeker')) {
    for (const v of bots.filter((b) => b.role === 'hider' && !sk.s.state.caught[b.s.me.pk])) {
      const d = distance(sk.pos, v.pos);
      if (d < 120) {
        const err = sk.s.spot(v.s.me.pk);
        if (!err) log(`${sk.s.me.name} spots ${v.s.me.name} at ${Math.round(d)}m`);
      }
    }
  }
}

let last = Date.now();
let rogueDone = false;
const loop = setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  hostDuties();
  bots.forEach((b) => step(b, dt));
  if (opt('rogue') && !rogueDone && bots[0].s.phase() === 'hunting') {
    const r = bots.find((b) => b.role !== 'hider');
    if (r) {
      r.rogueUntil = now + 35_000;
      rogueDone = true;
      log(`${r.s.me.name} goes rogue (leaves the zone)`);
    }
  }
  interactions();
  printFeed();
}, 1000);

const status = setInterval(() => {
  const s = bots[0].s;
  log(
    `phase=${s.phase()} relays=${s.relaysOnline()}/${s.relays().length} log=${s.log.length}`,
    `pings=${s.state.pings.length} caught=${Object.keys(s.state.caught).length}`,
    `dark=${s.darkHiders().length} left=${Math.round(s.timeLeft() / 1000)}s`,
  );
  for (const b of bots) {
    if (b.role === 'hider' && !b.s.state.caught[b.s.me.pk] && b.s.phase() === 'hunting') {
      log(`CODE ${b.s.me.name} ${b.s.catchCode()}  (QR: ${b.s.catchQr()})`);
    }
  }
  const outcome = bots[0].s.outcome();
  if (started || !createMode) {
    if (outcome && bots.every((b) => b.s.outcome())) finish();
  }
}, 10_000);

function finish() {
  clearInterval(loop);
  clearInterval(status);
  setTimeout(() => {
    log('---- REPORT ----');
    const sig = (b: Bot) =>
      JSON.stringify({
        caught: Object.keys(b.s.state.caught).sort(),
        pauses: b.s.state.pauses.length,
        winner: b.s.outcome()?.winner,
        oob: Object.fromEntries(Object.entries(b.s.state.oob).map(([k, v]) => [k.slice(0, 6), v.state])),
      });
    for (const b of bots) {
      const st = b.s.state;
      const exact = st.pings.filter((p) => p.exact).length;
      const fuzzy = st.pings.filter((p) => p.fuzzy).length;
      log(
        `${b.s.me.name.padEnd(10)} ${b.role.padEnd(6)} log=${b.s.log.length} pings=${st.pings.length} canSeeExact=${exact} canSeeFuzzy=${fuzzy} teammates=${Object.keys(b.s.live.positions).length}`,
      );
    }
    const sigs = new Set(bots.map(sig));
    log(sigs.size === 1 ? 'CONSISTENT ✅ all phones agree:' : 'MISMATCH ❌', [...sigs].join('\n'));
    bots.forEach((b) => b.s.stop());
    process.exit(sigs.size === 1 ? 0 : 1);
  }, 8000);
}

process.on('SIGINT', () => finish());
