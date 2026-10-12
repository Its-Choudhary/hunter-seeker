import { generateSecretKey, finalizeEvent } from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';
const RELAYS = ['wss://relay.damus.io','wss://nos.lol','wss://relay.primal.net','wss://nostr.mom','wss://offchain.pub','wss://relay.snort.social','wss://nostr.oxtr.dev'];
async function burst(url: string) {
  const sk = generateSecretKey(); let ok = 0; const errs: string[] = [];
  const relay = await Relay.connect(url);
  for (let i = 0; i < 25; i++) {
    const ev = finalizeEvent({ kind: 7461, created_at: Math.floor(Date.now()/1000), tags: [['g','hsburst']], content: 'x'.repeat(300) + i }, sk);
    try { await relay.publish(ev); ok++; } catch (e: any) { errs.push(String(e?.message ?? e).slice(0, 60)); }
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(url, `ok=${ok}/25`, [...new Set(errs)].join(' | '));
  relay.close();
}
await Promise.all(RELAYS.map(u => burst(u).catch(e => console.log(url, 'FAIL', e.message))));
process.exit(0);
