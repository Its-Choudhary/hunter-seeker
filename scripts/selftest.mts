// Offline checks for the engine building blocks. Run: npx tsx scripts/selftest.mts
import assert from 'node:assert/strict';
import * as C from '../src/engine/crypto.ts';
import * as G from '../src/engine/geo.ts';
import * as S from '../src/engine/schedule.ts';
import { DEFAULT_SETTINGS } from '../src/engine/types.ts';
import { randomBytes, bytesToHex } from '@noble/hashes/utils.js';
import { getPublicKey } from 'nostr-tools/pure';

// crypto
const secret = C.newGameSecret();
const code = C.encodeJoinCode(secret);
assert.deepEqual(C.parseJoinCode(`join my game: hunterseeker://join/${code} !`), secret);
const k = C.deriveGame(secret);
assert.deepEqual(C.decryptMaster(k, C.encryptMaster(k, { a: 1 })), { a: 1 });
assert.equal(C.decryptMaster(C.deriveGame(C.newGameSecret()), C.encryptMaster(k, { a: 1 })), null);
const team = C.newX25519(), other = C.newX25519();
const box = C.sealTo(team.pub, { lat: 26.29, lon: 73.02 });
assert.deepEqual(C.openWith(team.priv, box), { lat: 26.29, lon: 73.02 });
assert.equal(C.openWith(other.priv, box), null);
const sk = randomBytes(32), pk = getPublicKey(sk);
const w = C.catchWindow(Date.now());
const sig = C.signCatchToken(sk, k.gameId, pk, w);
assert.ok(C.verifyCatchToken(k.gameId, pk, w, sig));
assert.ok(!C.verifyCatchToken(k.gameId, pk, w + 1, sig));
const qr = C.encodeCatchQr({ g: k.gameId, p: pk, w, s: sig });
assert.deepEqual(C.parseCatchQr(qr), { g: k.gameId, p: pk, w, s: sig });
assert.match(C.catchCode(sk, k.gameId, w), /^\d{6}$/);
console.log('crypto ok', code);

// geo — Jodhpur clock tower area
const c = { lat: 26.2934, lon: 73.0243 };
const circle = { kind: 'circle' as const, center: c, radius: 500 };
assert.ok(G.edgeDistance(circle, c) < -499);
const out = G.offset(c, 600, 0);
assert.ok(Math.abs(G.distance(c, out) - 600) < 1);
assert.ok(Math.abs(G.edgeDistance(circle, out) - 100) < 1);
const sq = { kind: 'polygon' as const, points: [G.offset(c, -400, -400), G.offset(c, -400, 400), G.offset(c, 400, 400), G.offset(c, 400, -400)] };
assert.ok(Math.abs(G.edgeDistance(sq, c) + 400) < 2, String(G.edgeDistance(sq, c)));
assert.ok(Math.abs(G.edgeDistance(sq, G.offset(c, 450, 0)) - 50) < 2);
const ne = G.nearestEdgePoint(sq, G.offset(c, 450, 0));
assert.ok(Math.abs(G.distance(ne, G.offset(c, 400, 0))) < 2);
for (let i = 0; i < 200; i++) assert.ok(G.distance(c, G.randomInDisc(c, 200, Math.random)) <= 200.5);
console.log('geo ok');

// schedule
const st = { ...DEFAULT_SETTINGS, zone: circle };
const slots = S.pingSlots(st);
const full = slots.filter(s => s.full).map(s => (s.gt - S.hideMs(st)) / 60000);
console.log('exact pings at min:', full.join(' '));
console.log('mid circles:', slots.filter(s => !s.full).length);
assert.equal(full[0], 0);
for (let i = 1; i < slots.length; i++) assert.ok(slots[i].gt > slots[i - 1].gt);
const start = 1_000_000;
const pauses = [{ at: start + 60_000, until: start + 120_000, by: 'x' }];
assert.equal(S.gameTime(start, pauses, start + 180_000), 120_000);
assert.equal(S.wallTime(start, pauses, 120_000, start + 180_000), start + 180_000);
assert.equal(S.formatClock(65_000), '1:05');
console.log('schedule ok');
