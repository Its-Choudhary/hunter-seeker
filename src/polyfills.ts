// Must be imported before anything that uses crypto (nostr-tools, @noble/*).
import * as Crypto from 'expo-crypto';

const g = globalThis as any;
if (!g.crypto) g.crypto = {};
if (!g.crypto.getRandomValues) {
  g.crypto.getRandomValues = <T extends ArrayBufferView>(arr: T): T =>
    Crypto.getRandomValues(arr as any) as unknown as T;
}

// Minimal UTF-8 TextDecoder for JS engines that don't ship one.
if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = class {
    decode(input?: ArrayBufferView | ArrayBuffer): string {
      if (!input) return '';
      const b =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = '';
      for (let i = 0; i < b.length; ) {
        let c = b[i++];
        if (c > 0x7f) {
          const n = c > 0xef ? 3 : c > 0xdf ? 2 : 1;
          c &= (1 << (6 - n)) - 1;
          for (let k = 0; k < n; k++) c = (c << 6) | (b[i++] & 0x3f);
        }
        out += String.fromCodePoint(c);
      }
      return out;
    }
  };
}
