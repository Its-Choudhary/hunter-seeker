import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatClock, hideMs } from '../engine/schedule';
import type { Session } from '../engine/session';
import { useApp } from '../store';
import { BackgroundOff } from '../ui/BackgroundNote';
import { Avatar, Button, Card, Icon, Label, Row, T } from '../ui/kit';
import { C, F, type IconName, ROLE, alpha } from '../ui/theme';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function EndScreen({ session }: { session: Session }) {
  const leave = useApp((s) => s.leave);
  const st = session.state;
  const out = session.outcome()!;
  const huntStart = (st.startAt ?? 0) + hideMs(st.settings!);

  const look: { title: string; color: string; icon: IconName } =
    out.winner === 'hiders'
      ? { title: 'HIDERS WIN', color: ROLE.hider.color, icon: 'incognito' }
      : out.winner === 'chasers'
        ? { title: 'HUNTERS WIN', color: ROLE.hunter.color, icon: 'crosshairs-gps' }
        : { title: 'GAME OVER', color: C.muted, icon: 'flag-checkered' };

  const me = st.players[session.me.pk];
  const myTeamWon =
    (out.winner === 'hiders' && me?.role === 'hider') || (out.winner === 'chasers' && (me?.role === 'hunter' || me?.role === 'seeker'));

  const players = Object.values(st.players).filter((p) => p.role);
  const hiders = players.filter((p) => p.role === 'hider');
  const catches = (pk: string) => Object.values(st.caught).filter((c) => c.by === pk).length;
  const spots = (pk: string) => st.spots.filter((s) => s.seeker === pk && s.ok).length;
  const pings = (pk: string) => st.pings.filter((p) => p.from === pk && p.why === 'sched').length;

  const [pop] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, bounciness: 14, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [pop]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.hero, { backgroundColor: alpha(look.color, 0.08), borderColor: alpha(look.color, 0.4) }]}>
          <Animated.View style={[styles.trophy, { backgroundColor: alpha(look.color, 0.16), transform: [{ scale: pop }] }]}>
            <Icon name={out.winner === 'none' ? look.icon : 'trophy'} size={54} color={look.color} />
          </Animated.View>
          <Text style={[styles.title, { color: look.color }]}>{look.title}</Text>
          <Text style={[T.muted, { textAlign: 'center' }]}>{out.reason}</Text>
          {out.winner !== 'none' && me?.role && (
            <View style={[styles.youPill, { backgroundColor: myTeamWon ? alpha(C.good, 0.15) : alpha(C.bad, 0.15) }]}>
              <Text style={[styles.youText, { color: myTeamWon ? C.good : C.bad }]}>
                {myTeamWon ? 'YOUR TEAM WON' : 'BETTER LUCK NEXT TIME'}
              </Text>
            </View>
          )}
        </View>

        <Card>
          <Label icon="incognito">Hiders</Label>
          {hiders.map((p) => {
            const c = st.caught[p.pk];
            return (
              <Row key={p.pk} style={styles.row}>
                <Avatar name={p.name} color={p.color} role="hider" size={30} dim={!!c} />
                <Text style={[T.strong, { flex: 1 }]}>{p.name}</Text>
                {c ? (
                  <Text style={T.muted}>
                    caught at {formatClock(c.at - huntStart)}
                    {c.by ? ` by ${st.players[c.by]?.name ?? '?'}` : ''}
                  </Text>
                ) : (
                  <Row style={{ gap: 4 }}>
                    <Icon name="trophy" size={15} color={ROLE.hider.color} />
                    <Text style={[styles.win, { color: ROLE.hider.color }]}>Survived · {plural(pings(p.pk), 'ping', 'pings')}</Text>
                  </Row>
                )}
              </Row>
            );
          })}
        </Card>

        <Card>
          <Label icon="crosshairs-gps">Hunters & seekers</Label>
          {players
            .filter((p) => p.role !== 'hider')
            .map((p) => (
              <Row key={p.pk} style={styles.row}>
                <Avatar name={p.name} color={p.color} role={p.role} size={30} />
                <Text style={[T.strong, { flex: 1 }]}>{p.name}</Text>
                <Text style={T.muted}>
                  {p.role === 'hunter' ? plural(catches(p.pk), 'catch', 'catches') : plural(spots(p.pk), 'good spot', 'good spots')}
                </Text>
              </Row>
            ))}
        </Card>

        <BackgroundOff />

        <Button
          title="Back to home"
          icon="home"
          big
          onPress={async () => {
            await leave(false);
            router.dismissTo('/');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 10, padding: 26, borderRadius: 28, borderWidth: 1, marginTop: 10 },
  trophy: { width: 104, height: 104, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.display, fontSize: 36, letterSpacing: 2, textAlign: 'center' },
  youPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  youText: { fontFamily: F.display, letterSpacing: 1.5, fontSize: 13 },
  row: { paddingVertical: 8, gap: 10 },
  win: { fontFamily: F.semi, fontSize: 13 },
});
