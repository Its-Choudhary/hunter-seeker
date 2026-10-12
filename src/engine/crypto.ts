// All the cryptography in one place.
//
// - The join code holds a random game secret. Everything sent to relays is
//   encrypted with a key derived from it, so relays and strangers see noise.
// - Each team (hiders / chasers / hunters) gets its own x25519 keypair at game
//   start. Exact pings are sealed to the hunter team so only hunters can read
//   them; rough circles go to all chasers; hider positions only to hiders.
// - Catch QR codes are signed by the hider's key, so a catch can't be faked.

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { base64, base64urlnopad, utf8 } from '@scure/base';

export { bytesToHex, hexToBytes, randomBytes };

export interface GameKeys {
  secret: Uint8Array;
  master: Uint8Array; // symmetric key for every message
  tag: string; // what relays index the game by (reveals nothing)
  gameId: string; // short id used inside signatures
}

const JOIN_PREFIX = 'HS1.';

export function newGameSecret(): Uint8Array {
  return randomBytes(16);
}

export function deriveGame(secret: Uint8Array): GameKeys {
  return {
    secret,
    master: hkdf(sha256, secret, undefined, utf8ToBytes('hs-master'), 32),
    tag: bytesToHex(sha256(concatBytes(utf8ToBytes('hs-tag:'), secret))).slice(0, 32),
    gameId: bytesToHex(sha256(concatBytes(utf8ToBytes('hs-id:'), secret))).slice(0, 12),
  };
}

export function encodeJoinCode(secret: Uint8Array): string {
  return JOIN_PREFIX + base64urlnopad.encode(secret);
}

/** Accepts a bare code, or any text/link that contains one. */
export function parseJoinCode(text: string): Uint8Array | null {
  const m = /HS1\.([A-Za-z0-9_-]{22})/.exec(text.trim());
  if (!m) return null;
  try {
    const b = base64urlnopad.decode(m[1]);
    return b.length === 16 ? b : null;
  } catch {
    return null;
  }
}

// ---------- symmetric layer (everyone in the game) ----------

export function encryptMaster(keys: GameKeys, obj: unknown): string {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(keys.master, nonce).encrypt(utf8.decode(JSON.stringify(obj)));
  return base64.encode(concatBytes(nonce, ct));
}

export function decryptMaster<T = unknown>(keys: GameKeys, data: string): T | null {
  try {
    const raw = base64.decode(data);
    const pt = xchacha20poly1305(keys.master, raw.subarray(0, 24)).decrypt(raw.subarray(24));
    return JSON.parse(utf8.encode(pt)) as T;
  } catch {
    return null;
  }
}

// ---------- sealed boxes (only holders of a team/player secret can open) ----------

export function newX25519(): { priv: string; pub: string } {
  const priv = x25519.utils.randomSecretKey();
  return { priv: bytesToHex(priv), pub: bytesToHex(x25519.getPublicKey(priv)) };
}

function boxKey(shared: Uint8Array, eph: Uint8Array, pub: Uint8Array) {
  return hkdf(sha256, shared, concatBytes(eph, pub), utf8ToBytes('hs-seal'), 32);
}

export function sealTo(pubHex: string, obj: unknown): string {
  const pub = hexToBytes(pubHex);
  const ephPriv = x25519.utils.randomSecretKey();
  const eph = x25519.getPublicKey(ephPriv);
  const key = boxKey(x25519.getSharedSecret(ephPriv, pub), eph, pub);
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce).encrypt(utf8.decode(JSON.stringify(obj)));
  return base64.encode(concatBytes(eph, nonce, ct));
}

export function openWith<T = unknown>(privHex: string, data: string): T | null {
  try {
    const priv = hexToBytes(privHex);
    const raw = base64.decode(data);
    const eph = raw.subarray(0, 32);
    const key = boxKey(x25519.getSharedSecret(priv, eph), eph, x25519.getPublicKey(priv));
    const pt = xchacha20poly1305(key, raw.subarray(32, 56)).decrypt(raw.subarray(56));
    return JSON.parse(utf8.encode(pt)) as T;
  } catch {
    return null;
  }
}

// ---------- catching ----------

export const CATCH_WINDOW_MS = 30_000;
export const catchWindow = (now: number) => Math.floor(now / CATCH_WINDOW_MS);

const catchMsg = (gameId: string, pk: string, w: number) =>
  sha256(utf8ToBytes(`hs-catch:${gameId}:${pk}:${w}`));

/** Hider's QR payload: proves "this is really me, right now". */
export function signCatchToken(sk: Uint8Array, gameId: string, pk: string, w: number): string {
  return bytesToHex(schnorr.sign(catchMsg(gameId, pk, w), sk));
}

export function verifyCatchToken(gameId: string, pk: string, w: number, sig: string): boolean {
  try {
    return schnorr.verify(hexToBytes(sig), catchMsg(gameId, pk, w), hexToBytes(pk));
  } catch {
    return false;
  }
}

/** 6-digit fallback code (when there's no camera). Only the hider's phone can check it. */
export function catchCode(sk: Uint8Array, gameId: string, w: number): string {
  const mac = hmac(sha256, sk, utf8ToBytes(`hs-code:${gameId}:${w}`));
  const n = ((mac[0] << 24) | (mac[1] << 16) | (mac[2] << 8) | mac[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, '0');
}

export interface CatchQr {
  g: string; // game id
  p: string; // hider pubkey
  w: number;
  s: string; // signature
}

export function encodeCatchQr(q: CatchQr): string {
  return `HSC.${q.g}.${q.p}.${q.w}.${q.s}`;
}

export function parseCatchQr(text: string): CatchQr | null {
  const m = /HSC\.([0-9a-f]{12})\.([0-9a-f]{64})\.(\d+)\.([0-9a-f]{128})/.exec(text.trim());
  return m ? { g: m[1], p: m[2], w: Number(m[3]), s: m[4] } : null;
}

/** Crypto-quality random number in [0,1). */
export function secureRandom(): number {
  const b = randomBytes(4);
  return (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0) / 2 ** 32;
}
