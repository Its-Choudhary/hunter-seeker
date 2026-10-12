import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Session } from '../engine/session';
import { Button, Dot, Icon, Label, Row, T } from './kit';
import { C, F } from './theme';

/** Shows how many relays this phone is connected to; tap for details. */
export default function RelayBadge({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const info = session.relays();
  const n = session.relaysOnline();
  const color = n >= 2 ? C.good : n === 1 ? C.warn : C.bad;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.badge} accessibilityLabel="Network status">
        <Icon name={n ? 'access-point' : 'wifi-off'} size={15} color={color} />
        <Text style={[styles.text, { color }]}>{n === 0 ? 'OFFLINE' : `${n}/${info.length}`}</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.card}>
            <Label icon="access-point">Network</Label>
            <Text style={[T.muted, { marginBottom: 6 }]}>
              Moves go to every relay at once, encrypted. If some are down the game carries on through the others. If
              all are down, your moves wait on the phone and send when you’re back online.
            </Text>
            {info.map((r) => (
              <Row key={r.url} style={styles.row}>
                <Dot
                  size={8}
                  color={r.status === 'online' ? C.good : r.status === 'cooldown' ? C.warn : r.status === 'connecting' ? C.blue : C.bad}
                />
                <Text style={[T.body, { flex: 1, fontSize: 14 }]}>{r.url.replace('wss://', '')}</Text>
                <Text style={T.muted}>
                  {r.status}
                  {r.queued ? ` · ${r.queued} waiting` : ''}
                </Text>
              </Row>
            ))}
            <Button title="Close" kind="secondary" small style={{ marginTop: 8 }} onPress={() => setOpen(false)} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16,21,29,0.92)',
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 34,
  },
  text: { fontFamily: F.display, fontSize: 13, letterSpacing: 0.5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: C.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    padding: 18,
  },
  row: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line },
});
