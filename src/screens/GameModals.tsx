import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { CATCH_WINDOW_MS, catchWindow } from '../engine/crypto';
import type { Session } from '../engine/session';
import { formatClock } from '../engine/schedule';
import type { FeedItem, Player } from '../engine/types';
import { setSimMode, useLocation } from '../location';
import { Avatar, Button, Card, Icon, Label, Row, T, tap } from '../ui/kit';
import { BackgroundStatus } from '../ui/BackgroundNote';
import ScanFrame from '../ui/ScanFrame';
import Sheet from '../ui/Sheet';
import { C, F, type IconName, ROLE, alpha } from '../ui/theme';
import { useNow } from '../ui/useNow';
import { confirm } from './Lobby';

const uncaughtHiders = (s: Session): Player[] =>
  Object.values(s.state.players).filter((p) => p.role === 'hider' && !s.state.caught[p.pk]);

/** Hider: the live QR (and 6-digit code) a hunter scans to catch you. */
export function CatchCodeSheet({ session, visible, onClose }: { session: Session; visible: boolean; onClose: () => void }) {
  const now = useNow(500, visible);
  const w = catchWindow(now);
  const qr = useMemo(() => session.catchQr(w * CATCH_WINDOW_MS), [session, w]);
  const code = useMemo(() => session.catchCode(w * CATCH_WINDOW_MS), [session, w]);
  const left = (w + 1) * CATCH_WINDOW_MS - now;

  return (
    <Sheet visible={visible} onClose={onClose} title="Caught? Show this" icon="qrcode" color={ROLE.hider.color}>
      <Text style={[T.muted, { textAlign: 'center', marginBottom: 14 }]}>
        The hunter who tagged you scans it. It changes every 30 s, so screenshots don’t work.
      </Text>
      <View style={styles.qrBox}>
        <QRCode value={qr} size={220} backgroundColor="#fff" color="#07090d" />
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${(left / CATCH_WINDOW_MS) * 100}%`, backgroundColor: ROLE.hider.color }]} />
      </View>
      <Text style={[T.muted, { textAlign: 'center', marginTop: 12 }]}>No camera? Read out this code</Text>
      <Text style={styles.code}>
        {code.slice(0, 3)} {code.slice(3)}
      </Text>
      <Button
        title="I got caught"
        icon="flag-outline"
        kind="secondary"
        small
        style={{ marginTop: 14 }}
        onPress={() =>
          confirm('Give yourself up?', 'You’ll be marked as caught for everyone.', () => {
            session.surrender();
            onClose();
          }, 'I’m caught')
        }
      />
    </Sheet>
  );
}

/** Hunter: scan a hider's live QR. */
export function ScanSheet({
  session,
  visible,
  onClose,
  onResult,
}: {
  session: Session;
  visible: boolean;
  onClose: () => void;
  onResult: (msg: string, ok: boolean) => void;
}) {
  const [perm, requestPerm] = useCameraPermissions();
  const busy = useRef(false);
  useEffect(() => {
    if (visible) busy.current = false;
  }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Scan to catch" icon="qrcode-scan" color={ROLE.hunter.color}>
      <View style={styles.camBox}>
        {Platform.OS === 'web' ? (
          <View style={styles.camEmpty}>
            <Icon name="cellphone-check" size={40} color={C.muted} />
            <Text style={[T.muted, { textAlign: 'center' }]}>Scanning works in the phone app. Use “Code” instead.</Text>
          </View>
        ) : perm?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(r) => {
                if (busy.current) return;
                busy.current = true;
                const err = session.catchFromQr(r.data);
                onResult(err ?? 'Caught! 🎯', !err);
                onClose();
              }}
            />
            <ScanFrame color={ROLE.hunter.color} />
          </>
        ) : (
          <View style={styles.camEmpty}>
            <Icon name="camera" size={40} color={C.muted} />
            <Button title="Allow camera" icon="camera" onPress={requestPerm} color={ROLE.hunter.color} />
          </View>
        )}
      </View>
      <Text style={[T.muted, { textAlign: 'center', marginTop: 10 }]}>Ask the hider to tap “My catch code”.</Text>
    </Sheet>
  );
}

/** Hunter: type the 6-digit code instead of scanning. */
export function CodeSheet({
  session,
  visible,
  onClose,
  onResult,
}: {
  session: Session;
  visible: boolean;
  onClose: () => void;
  onResult: (msg: string, ok: boolean) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const hiders = uncaughtHiders(session);
  return (
    <Sheet visible={visible} onClose={onClose} title="Catch with code" icon="dialpad" color={ROLE.hunter.color}>
      <Label>Who did you catch?</Label>
      <Row style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        {hiders.map((p) => (
          <Pressable
            key={p.pk}
            onPress={() => {
              tap();
              setTarget(p.pk);
            }}
            style={[styles.pick, target === p.pk && { borderColor: ROLE.hunter.color, backgroundColor: alpha(ROLE.hunter.color, 0.15) }]}
          >
            <Avatar name={p.name} color={p.color} size={24} />
            <Text style={T.strong}>{p.name}</Text>
          </Pressable>
        ))}
      </Row>
      <Label>Their 6-digit code</Label>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        placeholder="000 000"
        placeholderTextColor={C.dim}
        keyboardType="number-pad"
        style={styles.codeInput}
      />
      <Button
        title="Catch!"
        icon="target-account"
        color={ROLE.hunter.color}
        big
        style={{ marginTop: 14 }}
        disabled={!target || code.length !== 6}
        onPress={() => {
          const err = session.catchWithCode(target!, code);
          onResult(err ?? 'Sent — waiting for their phone to confirm…', !err);
          if (!err) {
            setCode('');
            onClose();
          }
        }}
      />
    </Sheet>
  );
}

/** Seeker: pick which hider you can see. */
export function SpotSheet({
  session,
  visible,
  onClose,
  onResult,
}: {
  session: Session;
  visible: boolean;
  onClose: () => void;
  onResult: (msg: string, ok: boolean) => void;
}) {
  const hiders = uncaughtHiders(session);
  return (
    <Sheet visible={visible} onClose={onClose} title="Who can you see?" icon="eye" color={ROLE.seeker.color}>
      <Text style={[T.muted, { marginBottom: 14 }]}>
        If you’re really within {session.settings?.spotRangeM ?? 150} m, their exact location goes to the hunters right
        now. A wrong guess just uses up your Spot.
      </Text>
      <View style={{ gap: 8 }}>
        {hiders.map((p) => (
          <Pressable
            key={p.pk}
            style={({ pressed }) => [styles.spotRow, pressed && { opacity: 0.75 }]}
            onPress={() => {
              tap();
              const err = session.spot(p.pk);
              onResult(err ?? `Spot on ${p.name} sent`, !err);
              onClose();
            }}
          >
            <Avatar name={p.name} color={p.color} size={30} role="hider" />
            <Text style={[T.h3, { flex: 1 }]}>{p.name}</Text>
            <View style={styles.spotBtn}>
              <Icon name="eye" size={16} color="#07090d" />
              <Text style={styles.spotBtnText}>SPOT</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const TONE: Record<FeedItem['tone'], { color: string; icon: IconName }> = {
  info: { color: C.muted, icon: 'information' },
  good: { color: C.good, icon: 'check-circle' },
  bad: { color: C.warn, icon: 'alert-circle' },
  alert: { color: C.accent, icon: 'bell-ring' },
};

/** Everything else: players, event feed, pause/SOS, end, leave. */
export function MenuSheet({
  session,
  visible,
  onClose,
  onLeave,
}: {
  session: Session;
  visible: boolean;
  onClose: () => void;
  onLeave: () => void;
}) {
  const st = session.state;
  const now = useNow(2000, visible);
  const dark = new Set(session.darkHiders(now));
  const sim = useLocation((s) => s.mode === 'sim');
  const paused = session.paused(now);
  const players = Object.values(st.players).filter((p) => !p.left || p.role);
  const order = { hider: 0, hunter: 1, seeker: 2 } as const;
  players.sort((a, b) => (a.role ? order[a.role] : 3) - (b.role ? order[b.role] : 3));

  return (
    <Sheet visible={visible} onClose={onClose} title="Game" icon="menu" scroll>
      <View style={styles.tiles}>
        {paused ? (
          <Tile icon="play" label="Resume" color={C.good} onPress={() => (session.resume(), onClose())} />
        ) : (
          <Tile icon="pause" label="Pause" color={C.blue} onPress={() => (session.pause(), onClose())} />
        )}
        <Tile
          icon="alert-octagon"
          label="SOS"
          color={C.bad}
          onPress={() =>
            confirm('Send SOS?', 'Pauses the game for everyone and shows them where you are.', () => {
              session.pause(true);
              onClose();
            }, 'Send SOS')
          }
        />
        <Tile
          icon="flag-checkered"
          label="End game"
          color={C.warn}
          onPress={() =>
            confirm('End the game?', 'This ends it on every phone. No winner.', () => {
              session.endGame();
              onClose();
            }, 'End game')
          }
        />
        <Tile icon="exit-run" label="Leave" color={C.muted} onPress={onLeave} />
      </View>

      <BackgroundStatus />

      <View>
        <Label icon="account-group">Players</Label>
        {players.map((p) => {
          const caught = st.caught[p.pk];
          const oob = st.oob[p.pk]?.state;
          const seen = Math.max(session.live.lastSeen[p.pk] ?? 0, p.lastSeen);
          const tags: { text: string; color: string }[] = [];
          if (caught) tags.push({ text: `caught${caught.by ? ' by ' + (st.players[caught.by]?.name ?? '?') : ''}`, color: C.muted });
          if (dark.has(p.pk)) tags.push({ text: 'missed ping', color: C.warn });
          if (oob && oob !== 'in') tags.push({ text: oob === 'out' ? 'out of zone' : 'leaving zone', color: C.bad });
          if (now < (st.frozenUntil[p.pk] ?? 0)) tags.push({ text: 'frozen', color: C.ice });
          if (now - seen > 60_000) tags.push({ text: `offline ${formatClock(now - seen)}`, color: C.warn });
          return (
            <Row key={p.pk} style={styles.playerRow}>
              <Avatar name={p.name} color={p.color} role={p.role} size={28} dim={!!caught} />
              <Text style={[T.strong, { flex: 1 }]} numberOfLines={1}>
                {p.name}
                {p.pk === session.me.pk ? ' (you)' : ''}
              </Text>
              {tags.slice(0, 2).map((t) => (
                <View key={t.text} style={[styles.tag, { borderColor: alpha(t.color, 0.5) }]}>
                  <Text style={[styles.tagText, { color: t.color }]}>{t.text}</Text>
                </View>
              ))}
            </Row>
          );
        })}
      </View>

      <View>
        <Label icon="history">What happened</Label>
        {[...st.feed]
          .reverse()
          .slice(0, 25)
          .map((f, i) => (
            <Row key={i} style={{ paddingVertical: 5, alignItems: 'flex-start', gap: 10 }}>
              <Icon name={TONE[f.tone].icon} size={16} color={TONE[f.tone].color} style={{ marginTop: 1 }} />
              <Text style={[T.body, { flex: 1, fontSize: 14 }]}>{f.text}</Text>
              <Text style={[T.muted, { fontSize: 12 }]}>
                {new Date(f.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Row>
          ))}
      </View>

      {__DEV__ && (
        <Card style={{ gap: 6, backgroundColor: C.card2 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={T.strong}>Simulate GPS (testing)</Text>
              <Text style={T.muted}>Tap the map to move yourself. Dev builds only.</Text>
            </View>
            <Switch
              value={sim}
              onValueChange={(v) => setSimMode(v, session.fix ?? (session.settings ? zoneStart(session) : null))}
              trackColor={{ true: C.accent, false: C.line }}
              thumbColor="#fff"
            />
          </Row>
        </Card>
      )}
    </Sheet>
  );
}

function Tile({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, { borderColor: alpha(color, 0.4), backgroundColor: alpha(color, 0.1) }, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={24} color={color} />
      <Text style={[styles.tileText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function zoneStart(session: Session) {
  const z = session.settings!.zone;
  return z.kind === 'circle' ? z.center : z.points[0];
}

const styles = StyleSheet.create({
  qrBox: { alignSelf: 'center', padding: 14, backgroundColor: '#fff', borderRadius: 20 },
  bar: { height: 6, backgroundColor: C.card2, borderRadius: 3, marginTop: 16, overflow: 'hidden' },
  barFill: { height: 6 },
  code: { color: C.text, fontSize: 44, fontFamily: F.display, textAlign: 'center', letterSpacing: 6 },
  camBox: { height: 320, borderRadius: 20, overflow: 'hidden', backgroundColor: C.card2 },
  camEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card2,
  },
  codeInput: {
    backgroundColor: C.card2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    color: C.text,
    fontSize: 34,
    fontFamily: F.display,
    letterSpacing: 10,
    textAlign: 'center',
    paddingVertical: 12,
  },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.line,
  },
  spotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: ROLE.seeker.color,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  spotBtnText: { fontFamily: F.display, color: '#07090d', letterSpacing: 1 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
  tileText: { fontFamily: F.bold, fontSize: 12 },
  playerRow: { paddingVertical: 7, gap: 10 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontFamily: F.semi, fontSize: 11 },
});
