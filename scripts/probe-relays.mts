// Checks which public Nostr relays accept + return our game event kind.
import { generateSecretKey, finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';

const RELAYS = (process.argv[2] ?? [
  'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom',
  'wss://relay.nostr.band', 'wss://offchain.pub', 'wss://relay.snort.social',
  'wss://nostr.oxtr.dev', 'wss://relay.nostr.bg', 'wss://nostr-pub.wellorder.net',
  'wss://relay.mostr.pub', 'wss://nostr.bitcoiner.social', 'wss://relay.nostr.net',
  'wss://nostr.data.haus', 'wss://relay.nostrplebs.com', 'wss://nostr.fmt.wiz.biz',
].join(',')).split(',');
const KIND = Number(process.argv[3] ?? 7461);

async function probe(url: string) {
  const sk = generateSecretKey();
  const tag = 'hsprobe' + Math.random().toString(16).slice(2, 10);
  const ev = finalizeEvent({ kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [['g', tag]], content: 'AAAA' + tag }, sk);
  const t0 = Date.now();
  let relay: Relay | undefined;
  try {
    relay = await Promise.race([Relay.connect(url), new Promise<never>((_, r) => setTimeout(() => r(new Error('connect timeout')), 6000))]);
    const conn = Date.now() - t0;
    await Promise.race([relay.publish(ev), new Promise((_, r) => setTimeout(() => r(new Error('publish timeout')), 6000))]);
    const got = await new Promise<number>((res) => {
      let n = 0;
      const sub = relay!.subscribe([{ kinds: [KIND], '#g': [tag] }], {
        onevent() { n++; }, oneose() { sub.close(); res(n); },
      });
      setTimeout(() => res(n), 6000);
    });
    console.log(`${got ? 'OK  ' : 'NOSTORE'} ${url} connect=${conn}ms total=${Date.now() - t0}ms stored=${got}`);
  } catch (e: any) {
    console.log(`FAIL ${url} ${String(e?.message ?? e).slice(0, 90)}`);
  } finally { try { relay?.close(); } catch {} }
}
await Promise.all(RELAYS.map(probe));
process.exit(0);
