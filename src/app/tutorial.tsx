// "How to play" — a narrated, video-style walkthrough of an example round,
// in English or Hindi.
import { useAudioPlayer } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatClock } from '../engine/schedule';
import GameMap from '../map/GameMap';
import { type Lang, WORDS } from '../tutorial/content';
import { CAST, FROZEN_OFF, OUT_OFF, type Timeline, sceneAt, stepAt, timeline } from '../tutorial/script';
import { VOICE } from '../tutorial/voice';
import { Avatar, Button, Icon, IconButton, RoleBadge, Row, T, tap } from '../ui/kit';
import Radar from '../ui/Radar';
import { C, F, type IconName, ROLE, alpha } from '../ui/theme';
import { useNow } from '../ui/useNow';

const native = Platform.OS !== 'web';
const HI = {
  title: 'Hind_700Bold',
  body: 'Hind_500Medium',
  semi: 'Hind_600SemiBold',
};

interface Clock {
  t: number; // playback seconds at `wall`
  wall: number; // ms epoch when `t` was true
  playing: boolean;
}

export default function Tutorial() {
  const params = useLocalSearchParams<{ lang?: string }>();
  const [lang, setLang] = useState<Lang>(params.lang === 'hi' ? 'hi' : 'en');
  const tl = useMemo(() => timeline(lang), [lang]);
  const [clock, setClock] = useState<Clock>(() => ({
    t: 0,
    wall: Date.now(),
    playing: true,
  }));
  const [sound, setSound] = useState(true);
  const elapsed = (now: number) => Math.min(tl.total, clock.t + Math.max(0, now - clock.wall) / 1000);
  const [stopped, setStopped] = useState(false); // reached the end
  const now = useNow(100, clock.playing && !stopped);

  const t = clock.playing ? elapsed(now) : clock.t;
  const step = stepAt(tl, t);
  const done = t >= tl.total;
  if (done !== stopped) setStopped(done); // adjust state while rendering (no effect needed)
  const words = WORDS[lang];
  const hi = lang === 'hi';

  // Clock updates are functional so quick repeated taps each build on the last.
  const timeOf = (c: Clock) => (c.playing ? Math.min(tl.total, c.t + (Date.now() - c.wall) / 1000) : c.t);

  // ---- narration: one pre-rendered clip per step, kept in sync with the clock ----
  const player = useAudioPlayer(null);
  const loaded = useRef('');
  useEffect(() => {
    const key = `${lang}-${step}`;
    if (!sound || !clock.playing || done) {
      player.pause();
      return;
    }
    const clip = VOICE[lang][step];
    const into = t - tl.starts[step];
    if (loaded.current !== key) {
      loaded.current = key;
      if (into > clip.sec) return; // jumped in after this step's line finished
      player.replace(clip.clip);
      if (into > 0.4) player.seekTo(into).catch(() => {});
    }
    player.play();
    // Only react to step / play state / language / mute changes, not every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, clock, sound, lang, done]);

  const jump = (delta: number) => {
    tap();
    loaded.current = '';
    setClock((c) => {
      const k = Math.max(0, Math.min(tl.starts.length - 1, stepAt(tl, Math.min(timeOf(c), tl.total - 0.01)) + delta));
      return { t: tl.starts[k] + 0.01, wall: Date.now(), playing: true };
    });
  };
  const toggle = () => {
    tap();
    if (done) loaded.current = '';
    setClock((c) =>
      timeOf(c) >= tl.total
        ? { t: 0, wall: Date.now(), playing: true }
        : { t: timeOf(c), wall: Date.now(), playing: !c.playing },
    );
  };
  const switchLang = (l: Lang) => {
    if (l === lang) return;
    tap();
    const next = timeline(l);
    loaded.current = '';
    setLang(l);
    setClock(() => ({ t: next.starts[step] + 0.01, wall: Date.now(), playing: true }));
  };

  // The map scene only changes when something happens; movement runs inside the map.
  const sceneKey = sceneAt(tl, t, clock);
  const json = JSON.stringify(sceneKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => sceneKey, [json]);

  // Caption slides in on each new step.
  const [cap] = useState(() => new Animated.Value(0));
  useEffect(() => {
    cap.setValue(0);
    Animated.spring(cap, {
      toValue: 1,
      useNativeDriver: native,
      speed: 14,
      bounciness: 6,
    }).start();
  }, [step, lang, cap]);

  const close = () => {
    player.pause();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <GameMap scene={scene} style={StyleSheet.absoluteFill} />

      {/* tap left / right to skip, middle to pause — like stories */}
      <View style={styles.tapZones}>
        <Pressable style={{ flex: 1 }} onPress={() => jump(-1)} accessibilityLabel="Previous step" />
        <Pressable style={{ flex: 2 }} onPress={toggle} accessibilityLabel={clock.playing ? 'Pause' : 'Play'} />
        <Pressable style={{ flex: 1 }} onPress={() => jump(1)} accessibilityLabel="Next step" />
      </View>

      <SafeAreaView style={styles.top} edges={['top']} pointerEvents="box-none">
        <View style={styles.bars}>
          {tl.durs.map((d, i) => (
            <View key={i} style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(0, Math.min(1, (t - tl.starts[i]) / d)) * 100}%`,
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 12 }}>
          <View style={styles.langSwitch}>
            {(['en', 'hi'] as const).map((l) => (
              <Pressable
                key={l}
                onPress={() => switchLang(l)}
                style={[styles.langBtn, lang === l && styles.langOn]}
                accessibilityLabel={l === 'en' ? 'English' : 'Hindi'}
              >
                <Text
                  style={[
                    styles.langText,
                    l === 'hi' && { fontFamily: HI.title, fontSize: 15 },
                    lang === l && { color: '#fff' },
                  ]}
                >
                  {l === 'en' ? 'EN' : 'हिं'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Row>
            <IconButton
              icon={sound ? 'volume-high' : 'volume-off'}
              label={sound ? 'Mute' : 'Unmute'}
              size={38}
              onPress={() => {
                loaded.current = sound ? loaded.current : '';
                setSound(!sound);
              }}
            />
            <IconButton icon="close" label="Close tutorial" size={38} onPress={close} />
          </Row>
        </Row>
        <View style={{ paddingHorizontal: 12, paddingTop: 10 }} pointerEvents="none">
          <Overlay tl={tl} t={t} step={step} />
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.bottom} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.caption}>
          <Animated.View
            style={{
              opacity: cap,
              transform: [
                {
                  translateY: cap.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            }}
          >
            <Row style={{ marginBottom: 6 }}>
              <View style={styles.stepPill}>
                <Text style={styles.stepPillText}>
                  {step + 1}/{tl.durs.length}
                </Text>
              </View>
              <Text
                style={[
                  styles.capTitle,
                  hi && {
                    fontFamily: HI.title,
                    fontSize: 22,
                    letterSpacing: 0,
                  },
                ]}
              >
                {hi ? words.steps[step].title : words.steps[step].title.toUpperCase()}
              </Text>
            </Row>
            <Text style={[styles.capText, hi && { fontFamily: HI.body, fontSize: 18, lineHeight: 27 }]}>
              {words.steps[step].text}
            </Text>
          </Animated.View>
          {done ? (
            <Row style={{ marginTop: 14 }}>
              <Button title={words.ui.watchAgain} icon="replay" kind="secondary" style={{ flex: 1 }} onPress={toggle} />
              <Button title={words.ui.letsPlay} icon="play" style={{ flex: 1 }} onPress={close} />
            </Row>
          ) : (
            <Row style={{ marginTop: 12, justifyContent: 'space-between' }}>
              <IconButton icon="skip-previous" label="Previous" size={42} onPress={() => jump(-1)} />
              <IconButton
                icon={clock.playing ? 'pause' : 'play'}
                label={clock.playing ? 'Pause' : 'Play'}
                size={52}
                active
                color={C.accent}
                onPress={toggle}
              />
              <IconButton icon="skip-next" label="Next" size={42} onPress={() => jump(1)} />
            </Row>
          )}
          <Text style={styles.time}>
            {formatClock(t * 1000)} / {formatClock(tl.total * 1000)}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

/** The in-app UI the players would be looking at during each step. */
function Overlay({ tl, t, step }: { tl: Timeline; t: number; step: number }) {
  const local = t - tl.starts[step];
  const ui = WORDS[tl.lang].ui;
  const hi = tl.lang === 'hi';
  switch (step) {
    case 0:
      return (
        <View style={[styles.mock, { alignItems: 'center', paddingVertical: 18 }]}>
          <Radar size={110} />
          <Text style={[T.h2, { marginTop: 10 }]}>
            HUNTER <Text style={{ color: C.accent }}>SEEKER</Text>
          </Text>
          <Text style={[T.muted, hi && { fontFamily: HI.body, fontSize: 15 }]}>{ui.intro}</Text>
        </View>
      );
    case 1:
      return <Chipline icon="map-marker-radius" color={C.accent} text={ui.zoneChip} hi={hi} />;
    case 2:
      return (
        <View style={{ gap: 8 }}>
          {(Object.keys(CAST) as (keyof typeof CAST)[]).map((w, i) => (
            <Pop key={w} delay={i * 0.6} local={local}>
              <View style={[styles.mock, styles.castRow]}>
                <Avatar name={CAST[w].name} color={CAST[w].color} role={CAST[w].role} size={28} />
                <Text style={[T.strong, { flex: 1 }]}>{CAST[w].name}</Text>
                <RoleBadge role={CAST[w].role} small />
              </View>
            </Pop>
          ))}
        </View>
      );
    case 3:
      return <TimerMock label="HIDE! HUNTERS RELEASED IN" ms={Math.max(0, 600_000 * (1 - local / 6))} />;
    case 4:
      return local < 1 ? (
        <TimerMock label="NEXT PING IN" ms={1000 * (1 - local)} />
      ) : (
        <View style={{ gap: 8 }}>
          <TimerMock label="NEXT PING IN" ms={300_000 - (local - 1) * 20_000} />
          <ToastMock icon="map-marker" color={C.accent} text={ui.pingToast} hi={hi} />
        </View>
      );
    case 5:
      return (
        <View style={{ gap: 8 }}>
          <TimerMock label="YOU’LL BE PINGED IN" ms={160_000 - local * 18_000} />
          {local > 4.5 && <ToastMock icon="help-circle" color={C.warn} text={ui.nobodyThere} hi={hi} />}
        </View>
      );
    case 6:
      return (
        <View style={{ gap: 8 }}>
          <RoleBadge role="seeker" filled />
          <TimerMock label="NEXT CIRCLE IN" ms={150_000 - local * 15_000} />
        </View>
      );
    case 7:
      return (
        <View style={{ gap: 8 }}>
          <View
            style={[
              styles.fakeBtn,
              { backgroundColor: ROLE.seeker.color },
              local > 1.6 && local < 2.4 && { transform: [{ scale: 0.95 }] },
            ]}
          >
            <Icon name="eye" size={22} color="#07090d" />
            <Text style={styles.fakeBtnText}>SPOT A HIDER</Text>
          </View>
          {local > 2 && <ToastMock icon="eye" color={ROLE.seeker.color} text={ui.spotToast} hi={hi} />}
        </View>
      );
    case 8:
      return local < 5 ? (
        <View style={[styles.mock, { flexDirection: 'row', gap: 14, alignItems: 'center' }]}>
          <View style={{ padding: 6, backgroundColor: '#fff', borderRadius: 10 }}>
            <QRCode value="HSC.tutorial.example" size={86} backgroundColor="#fff" color="#07090d" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[T.strong, hi && { fontFamily: HI.semi, fontSize: 16 }]}>{ui.kabirShows}</Text>
            <Text style={[T.muted, hi && { fontFamily: HI.body, fontSize: 14 }]}>{ui.amanScans}</Text>
          </View>
        </View>
      ) : (
        <ToastMock icon="target-account" color={C.accent} text={ui.caughtToast} hi={hi} />
      );
    case 9:
      if (local < OUT_OFF) return <ToastMock icon="run-fast" color={C.muted} text={ui.runsFar} hi={hi} />;
      if (local < FROZEN_OFF) {
        return (
          <Banner
            icon="alert"
            color={C.bad}
            text={`OUT OF ZONE — back in ${Math.max(1, Math.ceil(30 - (local - OUT_OFF) * 10))}s`}
          />
        );
      }
      return <Banner icon="snowflake" color={C.bad} text="FROZEN — can’t catch until back inside" />;
    case 10:
      return (
        <View style={[styles.mock, { alignItems: 'center', gap: 6 }]}>
          <Icon name="alert-octagon" size={34} color={C.bad} />
          <Text style={T.h3}>SOS from Rahul</Text>
          <Text style={[T.muted, { textAlign: 'center' }, hi && { fontFamily: HI.body, fontSize: 15 }]}>
            {ui.sosSub}
          </Text>
        </View>
      );
    case 11:
      return local < 3 ? (
        <TimerMock label="TIME LEFT" ms={Math.max(0, 3000 - local * 1000)} />
      ) : (
        <Pop local={local} delay={3}>
          <View
            style={[
              styles.mock,
              {
                alignItems: 'center',
                gap: 6,
                borderColor: alpha(ROLE.hider.color, 0.6),
              },
            ]}
          >
            <Icon name="trophy" size={40} color={ROLE.hider.color} />
            <Text style={[T.h2, { color: ROLE.hider.color }]}>HIDERS WIN</Text>
            <Text style={[T.muted, hi && { fontFamily: HI.body, fontSize: 15 }]}>{ui.survived}</Text>
          </View>
        </Pop>
      );
  }
  return null;
}

function Pop({ children, local, delay }: { children: React.ReactNode; local: number; delay: number }) {
  const k = Math.max(0, Math.min(1, (local - delay) / 0.35));
  return <View style={{ opacity: k, transform: [{ translateY: (1 - k) * 12 }] }}>{children}</View>;
}

function TimerMock({ label, ms }: { label: string; ms: number }) {
  const urgent = label === 'NEXT PING IN' && ms <= 1000;
  return (
    <View
      style={[
        styles.timer,
        urgent && {
          backgroundColor: 'rgba(200,40,40,0.95)',
          borderColor: C.bad,
        },
      ]}
    >
      <Text style={styles.timerLabel}>{label}</Text>
      <Text style={styles.timerBig}>{formatClock(Math.max(0, ms))}</Text>
    </View>
  );
}

function ToastMock({ icon, color, text, hi }: { icon: IconName; color: string; text: string; hi?: boolean }) {
  return (
    <View style={[styles.toast, { borderColor: alpha(color, 0.6) }]}>
      <Icon name={icon} size={20} color={color} />
      <Text style={[styles.toastText, hi && { fontFamily: HI.semi, fontSize: 16 }]}>{text}</Text>
    </View>
  );
}

function Banner({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: color }]}>
      <Icon name={icon} size={18} color="#fff" />
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

function Chipline({ icon, color, text, hi }: { icon: IconName; color: string; text: string; hi?: boolean }) {
  return (
    <View style={[styles.mock, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
      <Icon name={icon} size={22} color={color} />
      <Text style={[T.strong, hi && { fontFamily: HI.semi, fontSize: 17 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tapZones: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  bars: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
  },
  barTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  barFill: { height: 3, backgroundColor: '#fff' },
  langSwitch: {
    flexDirection: 'row',
    backgroundColor: 'rgba(16,21,29,0.92)',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    padding: 3,
  },
  langBtn: {
    paddingHorizontal: 14,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langOn: { backgroundColor: C.accent },
  langText: {
    color: C.muted,
    fontFamily: F.display,
    fontSize: 13,
    letterSpacing: 1,
  },
  mock: {
    backgroundColor: 'rgba(16,21,29,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
  },
  castRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  timer: {
    backgroundColor: 'rgba(10,14,20,0.94)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: C.line,
  },
  timerLabel: {
    color: C.muted,
    fontFamily: F.displaySemi,
    fontSize: 12,
    letterSpacing: 1.8,
  },
  timerBig: {
    color: '#fff',
    fontFamily: F.display,
    fontSize: 38,
    lineHeight: 44,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16,21,29,0.97)',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  toastText: { flex: 1, color: C.text, fontFamily: F.semi, fontSize: 14 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bannerText: { flex: 1, color: '#fff', fontFamily: F.bold, fontSize: 14 },
  fakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 58,
    borderRadius: 18,
  },
  fakeBtnText: {
    fontFamily: F.display,
    fontSize: 17,
    color: '#07090d',
    letterSpacing: 1,
  },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  caption: {
    margin: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(10,14,20,0.96)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.line,
    padding: 18,
    maxWidth: 600,
    width: '94%',
    alignSelf: 'center',
  },
  stepPill: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stepPillText: { color: '#fff', fontFamily: F.display, fontSize: 12 },
  capTitle: {
    color: C.text,
    fontFamily: F.display,
    fontSize: 20,
    letterSpacing: 1.2,
    flex: 1,
  },
  capText: {
    color: C.text,
    fontFamily: F.medium,
    fontSize: 16,
    lineHeight: 23,
  },
  time: {
    color: C.dim,
    fontFamily: F.display,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
