import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '../store';
import { Avatar, Button, Card, Icon, Label, Row, T, tap } from '../ui/kit';
import Radar from '../ui/Radar';
import { C, F, PLAYER_COLORS, ROLE, alpha } from '../ui/theme';

export default function Home() {
  const ready = useApp((s) => s.ready);
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return <HomeInner />;
}

function HomeInner() {
  const { profile, saved, session, setProfile, rejoin, leave } = useApp();
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? PLAYER_COLORS[0]);

  const trimmed = name.trim().slice(0, 20);
  const go = async (path: '/create' | '/join') => {
    await setProfile({ name: trimmed, color });
    router.push(path);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Radar size={190} />
          <Text style={styles.title}>
            HUNTER <Text style={{ color: C.accent }}>SEEKER</Text>
          </Text>
          <Text style={styles.tagline}>REAL-WORLD HIDE & SEEK · LIVE GPS PINGS</Text>
        </View>

        {saved && (
          <View style={styles.resume}>
            <Row style={{ marginBottom: 12 }}>
              <View style={styles.liveDot} />
              <Text style={[T.h3, { flex: 1 }]}>Game in progress</Text>
              <Pressable onPress={() => leave()} hitSlop={10} accessibilityLabel="Leave game">
                <Text style={[T.muted, { fontFamily: F.semi }]}>Leave</Text>
              </Pressable>
            </Row>
            <Button
              title="Jump back in"
              icon="play"
              onPress={() => {
                if (!session) rejoin();
                router.push('/game');
              }}
            />
          </View>
        )}

        <Pressable
          onPress={() => {
            tap();
            router.push('/tutorial');
          }}
          style={({ pressed }) => [styles.watch, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Watch how to play"
        >
          <View style={styles.watchPlay}>
            <Icon name="play" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>New here? Watch how it works</Text>
            <Text style={T.muted}>A 1½-minute example round, narrated</Text>
          </View>
          <Icon name="chevron-right" size={22} color={C.muted} />
        </Pressable>
        <Pressable
          onPress={() => {
            tap();
            router.push('/tutorial?lang=hi');
          }}
          style={styles.hindi}
          accessibilityRole="button"
          accessibilityLabel="Watch in Hindi"
        >
          <Icon name="translate" size={16} color={C.accent} />
          <Text style={styles.hindiText}>हिंदी में देखें — कैसे खेलें</Text>
        </Pressable>

        <Card>
          <Label icon="account">Your callsign</Label>
          <Row style={{ gap: 12 }}>
            <Avatar name={trimmed || '?'} color={color} size={44} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={C.dim}
              style={styles.input}
              maxLength={20}
              autoCorrect={false}
            />
          </Row>
          <Row style={{ marginTop: 14, justifyContent: 'space-between' }}>
            {PLAYER_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  tap();
                  setColor(c);
                }}
                accessibilityLabel={`colour ${c}`}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
              >
                {color === c && <Icon name="check" size={16} color="#07090d" />}
              </Pressable>
            ))}
          </Row>
        </Card>

        <View style={{ gap: 10 }}>
          <Button title="Create a game" icon="plus" big disabled={!trimmed} onPress={() => go('/create')} />
          <Button title="Join a game" icon="qrcode-scan" kind="secondary" big disabled={!trimmed} onPress={() => go('/join')} />
          {!trimmed && <Text style={[T.muted, { textAlign: 'center' }]}>Enter your name to play</Text>}
        </View>

        <View style={{ gap: 10, marginTop: 8 }}>
          <Label icon="information-outline">The roles</Label>
          {(['hider', 'hunter', 'seeker'] as const).map((r) => (
            <View key={r} style={[styles.role, { borderColor: alpha(ROLE[r].color, 0.35) }]}>
              <View style={[styles.roleIcon, { backgroundColor: alpha(ROLE[r].color, 0.15) }]}>
                <Icon name={ROLE[r].icon} size={24} color={ROLE[r].color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleName, { color: ROLE[r].color }]}>{ROLE[r].label.toUpperCase()}S</Text>
                <Text style={T.muted}>{ROLE[r].blurb}</Text>
              </View>
            </View>
          ))}
          <Row style={styles.rule}>
            <Icon name="map-marker-radius" size={20} color={C.accent} />
            <Text style={[T.muted, { flex: 1 }]}>
              Everyone stays inside the zone. Chasers who leave get frozen; hiders who leave get broadcast. Hiders win if
              anyone survives the clock.
            </Text>
          </Row>
          <Row style={styles.rule}>
            <Icon name="shield-check-outline" size={20} color={C.good} />
            <Text style={[T.muted, { flex: 1 }]}>
              No servers, no accounts. Your phones run the game and everything is encrypted end to end.
            </Text>
          </Row>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 6, gap: 14 },
  title: { color: C.text, fontFamily: F.display, fontSize: 38, letterSpacing: 2, textAlign: 'center' },
  tagline: { color: C.muted, fontFamily: F.displaySemi, fontSize: 12, letterSpacing: 2, textAlign: 'center', marginTop: -8 },
  resume: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: alpha(C.accent, 0.6),
    backgroundColor: alpha(C.accent, 0.08),
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  watch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: alpha(C.good, 0.35),
  },
  hindi: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: -6, paddingVertical: 6 },
  hindiText: { color: C.accent, fontFamily: 'Hind_600SemiBold', fontSize: 16 },
  watchPlay: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: C.card2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    color: C.text,
    fontSize: 18,
    fontFamily: F.semi,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  swatch: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: '#fff' },
  role: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: C.card,
  },
  roleIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  roleName: { fontFamily: F.display, fontSize: 16, letterSpacing: 1.2, marginBottom: 2 },
  rule: { alignItems: 'flex-start', gap: 12, paddingHorizontal: 4, paddingTop: 4 },
});
