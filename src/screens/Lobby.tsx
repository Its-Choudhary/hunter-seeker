import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { encodeJoinCode } from '../engine/crypto';
import { formatDistance, zoneSpan } from '../engine/geo';
import type { Session } from '../engine/session';
import type { Player, Role } from '../engine/types';
import GameMap from '../map/GameMap';
import { useApp } from '../store';
import { BackgroundCard } from '../ui/BackgroundNote';
import Header from '../ui/Header';
import { Avatar, Button, Card, Icon, IconButton, Label, RoleBadge, Row, T, tap } from '../ui/kit';
import RelayBadge from '../ui/RelayBadge';
import { C, F, type IconName, ROLE, alpha } from '../ui/theme';
import { useNow } from '../ui/useNow';

const ROLES: Role[] = ['hider', 'hunter', 'seeker'];

function autoRoles(players: Player[]): Record<string, Role> {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const n = shuffled.length;
  const hunters = Math.max(1, Math.round(n / 4));
  const seekers = n >= 5 ? Math.max(1, Math.floor(n / 5)) : 0;
  const out: Record<string, Role> = {};
  shuffled.forEach((p, i) => {
    out[p.pk] = i < hunters ? 'hunter' : i < hunters + seekers ? 'seeker' : 'hider';
  });
  return out;
}

export function confirm(title: string, message: string, ok: () => void, okText = 'OK') {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) ok();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: okText, style: 'destructive', onPress: ok },
  ]);
}

export default function Lobby({ session }: { session: Session }) {
  const leave = useApp((s) => s.leave);
  const [note, setNote] = useState('');
  const now = useNow(5000);

  const st = session.state;
  const code = encodeJoinCode(session.keys.secret);
  const players = Object.values(st.players)
    .filter((p) => !p.left)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const host = st.hostPk ? st.players[st.hostPk] : null;
  const isHost = session.isHost;
  const lastSeen = (pk: string) => Math.max(session.live.lastSeen[pk] ?? 0, st.players[pk]?.lastSeen ?? 0);
  const hostAway = !!host && now - lastSeen(host.pk) > 45_000;
  const settings = st.settings;
  const count = (r: Role) => players.filter((p) => p.role === r).length;
  const ready = count('hider') > 0 && count('hunter') > 0;

  const scene = useMemo(() => ({ zone: settings?.zone ?? null, fit: 1, interactive: false }), [settings]);

  // Remember what each tap asked for, so quick taps work even before the
  // change has come back through the game log.
  const intended = useRef<Record<string, Role | null>>({});
  const setRole = (p: Player, r: Role) => {
    const cur = p.pk in intended.current ? intended.current[p.pk] : p.role;
    const next = cur === r ? null : r; // tap the selected role again to clear it
    intended.current[p.pk] = next;
    session.setRoles({ [p.pk]: next });
  };

  const share = async () => {
    const message = `Join my Hunter Seeker game 🎯\nOpen the app → Join a game → paste:\n${code}`;
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(code);
      setNote('Invite code copied');
      return;
    }
    Share.share({ message }).catch(() => {});
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
      <Header
        title="Lobby"
        back={false}
        right={
          <Row>
            <RelayBadge session={session} />
            <IconButton icon="help-circle-outline" label="How to play" size={36} onPress={() => router.push('/tutorial')} />
            <IconButton
              icon="exit-to-app"
              label="Leave lobby"
              size={36}
              onPress={() =>
                confirm('Leave this game?', 'You can rejoin with the invite code.', async () => {
                  await leave();
                  router.dismissTo('/');
                }, 'Leave')
              }
            />
          </Row>
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        {!settings && (
          <Card style={{ borderColor: alpha(C.warn, 0.5) }}>
            <Row>
              <Icon name="access-point" color={C.warn} />
              <Text style={T.strong}>Connecting to the game…</Text>
            </Row>
            <Text style={[T.muted, { marginTop: 6 }]}>
              Waiting for the game details from the other phones. Make sure you have internet.
            </Text>
          </Card>
        )}

        <Card style={styles.invite}>
          <View style={styles.qr}>
            <QRCode value={code} size={124} backgroundColor="#fff" color="#07090d" />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={T.h3}>Invite friends</Text>
            <Text style={T.muted}>They scan this in Join. Anyone in the lobby can show it.</Text>
            <Text selectable style={styles.code} numberOfLines={1} testID="join-code">
              {code}
            </Text>
            <Row>
              <Button title="Share" icon="share-variant" small style={{ flex: 1 }} onPress={share} />
              <IconButton
                icon="content-copy"
                label="Copy code"
                size={40}
                onPress={async () => {
                  await Clipboard.setStringAsync(code);
                  setNote('Invite code copied');
                }}
              />
            </Row>
          </View>
        </Card>

        <Card style={{ paddingBottom: 6 }}>
          <Label
            icon="account-group"
            right={
              isHost && players.length > 1 ? (
                <Button
                  title="Auto"
                  icon="dice-multiple"
                  kind="secondary"
                  small
                  onPress={() => {
                    intended.current = {};
                    session.setRoles(autoRoles(players));
                  }}
                />
              ) : undefined
            }
          >
            {`Players · ${players.length}`}
          </Label>
          <View style={styles.teams}>
            {ROLES.map((r) => (
              <View key={r} style={[styles.team, { backgroundColor: alpha(ROLE[r].color, 0.12) }]}>
                <Icon name={ROLE[r].icon} size={16} color={ROLE[r].color} />
                <Text style={[styles.teamNum, { color: ROLE[r].color }]}>{count(r)}</Text>
                <Text style={styles.teamLabel}>{ROLE[r].label}s</Text>
              </View>
            ))}
          </View>
          {players.map((p) => {
            const online = now - lastSeen(p.pk) < 45_000;
            return (
              <View key={p.pk} style={styles.player}>
                <Avatar name={p.name} color={p.color} role={p.role} size={34} />
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: 6 }}>
                    <Text style={T.strong} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.pk === st.hostPk && <Icon name="crown" size={15} color={C.warn} />}
                  </Row>
                  <Text style={[T.muted, { fontSize: 12 }, !online && { color: C.warn }]}>
                    {p.pk === session.me.pk ? 'You' : online ? 'Online' : 'Not seen recently'}
                  </Text>
                </View>
                {isHost ? (
                  <Row style={{ gap: 6 }}>
                    {ROLES.map((r) => (
                      <RoleToggle key={r} icon={ROLE[r].icon} color={ROLE[r].color} label={`Make ${p.name} a ${ROLE[r].label}`} on={p.role === r} onPress={() => setRole(p, r)} />
                    ))}
                  </Row>
                ) : (
                  <RoleBadge role={p.role} small />
                )}
              </View>
            );
          })}
          <Text style={[T.muted, { paddingVertical: 10 }]}>
            {isHost
              ? 'Tap an icon to set each player’s role. Players with no role become referees and see everything.'
              : `${host?.name ?? 'The host'} sets the roles.`}
          </Text>
        </Card>

        <BackgroundCard />

        {settings && (
          <Card>
            <Label
              icon="cog-outline"
              right={
                isHost ? (
                  <Button title="Edit" icon="pencil" kind="secondary" small onPress={() => router.push('/create?edit=1')} />
                ) : undefined
              }
            >
              Game settings
            </Label>
            <View style={styles.miniMap}>
              <GameMap scene={scene} />
            </View>
            <View style={styles.stats}>
              <Stat icon="map-marker-radius" value={formatDistance(zoneSpan(settings.zone))} label="zone" />
              <Stat icon="timer-sand" value={fmtMin(settings.headStartMin)} label="head start" />
              <Stat icon="clock-outline" value={fmtMin(settings.durationMin)} label="hunt" />
              <Stat icon="crosshairs-gps" value={fmtMin(settings.pingEveryMin)} label={settings.accelerate ? 'pings ↓' : 'pings'} />
            </View>
          </Card>
        )}
        {!!note && <Text style={[T.muted, { textAlign: 'center', color: C.good }]}>{note}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        {isHost ? (
          <>
            <Button
              title="Start game"
              icon="flag-checkered"
              big
              disabled={!settings || !ready}
              onPress={() => setNote(session.startGame() ?? '')}
            />
            {!ready && (
              <Text style={[T.muted, { textAlign: 'center', marginTop: 6 }]}>Needs at least 1 hider and 1 hunter</Text>
            )}
          </>
        ) : (
          <View style={styles.waiting}>
            <Icon name="timer-sand" color={C.muted} />
            <Text style={[T.body, { flex: 1 }]}>Waiting for {host?.name ?? 'the host'} to start…</Text>
            {hostAway && <Button title="Take over" kind="secondary" small onPress={() => session.takeHost()} />}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const fmtMin = (m: number) => (m >= 1 ? `${m}m` : `${Math.round(m * 60)}s`);

function RoleToggle({ icon, color, on, onPress, label }: { icon: IconName; color: string; on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.toggle,
        on ? { backgroundColor: color, borderColor: color } : { borderColor: C.line },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name={icon} size={18} color={on ? '#07090d' : C.dim} />
    </Pressable>
  );
}

function Stat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={16} color={C.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center', paddingBottom: 24 },
  invite: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  qr: { padding: 8, backgroundColor: '#fff', borderRadius: 14 },
  code: { color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  teams: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  teamNum: { fontFamily: F.display, fontSize: 18 },
  teamLabel: { color: C.muted, fontFamily: F.medium, fontSize: 12 },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  toggle: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniMap: { height: 150, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: C.card2, borderRadius: 12, paddingVertical: 10 },
  statValue: { color: C.text, fontFamily: F.display, fontSize: 17 },
  statLabel: { color: C.muted, fontFamily: F.medium, fontSize: 11 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: C.line,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
  },
});
