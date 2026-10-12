import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { bearing, distance, formatDistance, nearestEdgePoint } from '../engine/geo';
import { formatClock, hideMs, lastSlot, nextSlot } from '../engine/schedule';
import type { Session } from '../engine/session';
import type { FeedItem, PingRecord } from '../engine/types';
import { simMoveTo, useLocation } from '../location';
import GameMap from '../map/GameMap';
import { LAYER_ICON, useMapLayer } from '../map/layer';
import type { MapCircle, MapLine, MapMarker, MapScene } from '../map/mapHtml';
import { useApp } from '../store';
import { Button, Icon, IconButton, RoleBadge, Row, T } from '../ui/kit';
import RelayBadge from '../ui/RelayBadge';
import { C, F, type IconName, ROLE, alpha } from '../ui/theme';
import { useNow } from '../ui/useNow';
import { CatchCodeSheet, CodeSheet, MenuSheet, ScanSheet, SpotSheet } from './GameModals';
import { confirm } from './Lobby';

const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : `${Math.floor(ms / 60_000)}m`);
const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
const buzz = (kind: 'warn' | 'heavy' | 'ok') => {
  if (Platform.OS === 'web') return;
  if (kind === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  else
    Haptics.notificationAsync(
      kind === 'warn' ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
};
const TOAST: Record<FeedItem['tone'], { color: string; icon: IconName }> = {
  info: { color: C.blue, icon: 'information' },
  good: { color: C.good, icon: 'check-circle' },
  bad: { color: C.warn, icon: 'alert-circle' },
  alert: { color: C.accent, icon: 'bell-ring' },
};

type Sheet = null | 'code' | 'scan' | 'type' | 'spot' | 'menu';

export default function LiveGame({ session }: { session: Session }) {
  // Without background location the app must stay open, so keep the screen on.
  // With it, players can lock their phones and save battery.
  const bg = useLocation((s) => s.background);
  const needAwake = bg !== 'on';
  useEffect(() => {
    if (!needAwake) return;
    activateKeepAwakeAsync('game').catch(() => {});
    return () => void deactivateKeepAwake('game').catch(() => {});
  }, [needAwake]);
  const leave = useApp((s) => s.leave);
  const sim = useLocation((s) => s.mode === 'sim');
  const locStatus = useLocation((s) => s.status);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<{ text: string; tone: FeedItem['tone']; key: number } | null>(null);
  const [follow, setFollow] = useState(false);
  const [fit, setFit] = useState(1);
  const now = useNow(1000);
  const { layer, toggle: toggleLayer } = useMapLayer();

  const st = session.state;
  const me = session.me.pk;
  const role = session.role;
  const caughtMe = st.caught[me];
  const phase = session.phase(now);
  const paused = session.paused(now);
  const gt = session.gameTime(now);
  const settings = st.settings!;
  const seeExact = !!st.myKeys.hunter;
  const seeFuzzy = !!st.myKeys.chaser;

  // ---- toasts for new feed items ----
  const seenFeed = useRef(st.feed.length);
  useEffect(() => {
    if (st.feed.length > seenFeed.current) {
      const f = st.feed[st.feed.length - 1];
      setToast({ text: f.text, tone: f.tone, key: f.at });
      if (f.tone === 'alert' || f.tone === 'bad') buzz('warn');
    }
    seenFeed.current = st.feed.length;
  }, [st.feed.length, st.feed]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (text: string, ok: boolean) => {
    setToast({ text, tone: ok ? 'good' : 'bad', key: Date.now() });
    buzz(ok ? 'ok' : 'warn');
  };

  // ---- clocks ----
  const slots = session.slots();
  const forSeeker = role === 'seeker';
  const next = nextSlot(slots, gt, !forSeeker);
  const prev = lastSlot(slots, gt, !forSeeker);
  const until = next ? next.gt - gt : null;
  const span = next ? next.gt - (prev?.gt ?? hideMs(settings)) : 1;
  const nextExact = nextSlot(slots, gt, true);

  // Hider heads-up: buzz 30 s before a ping.
  const warned = useRef<number>(-1);
  useEffect(() => {
    if (role !== 'hider' || caughtMe || phase !== 'hunting' || paused || !nextExact) return;
    if (nextExact.gt - gt <= 30_000 && warned.current !== nextExact.i) {
      warned.current = nextExact.i;
      buzz('warn');
    }
  });

  // ---- zone status ----
  const edge = session.edge();
  const oob = session.oobState();
  const frozenFor = (st.frozenUntil[me] ?? 0) - now;
  const back =
    session.fix && edge !== null && edge > -60
      ? { deg: bearing(session.fix, nearestEdgePoint(settings.zone, session.fix)), dist: Math.abs(edge) }
      : null;
  const lastOob = useRef(oob);
  useEffect(() => {
    if (oob !== 'in' && lastOob.current === 'in') buzz('heavy');
    lastOob.current = oob;
  }, [oob]);

  // ---- what to draw ----
  const scene: MapScene = useMemo(() => {
    const markers: MapMarker[] = [];
    const circles: MapCircle[] = [];
    const lines: MapLine[] = [];
    const name = (pk: string) => st.players[pk]?.name ?? '?';
    const color = (pk: string) => st.players[pk]?.color ?? '#999';
    const dark = new Set(session.darkHiders(now));

    // teammates (live positions)
    for (const [pk, pos] of Object.entries(session.live.positions)) {
      if (pk === me || st.caught[pk] || !st.players[pk]) continue;
      const stale = now - pos.t > 60_000;
      const r = st.players[pk].role;
      markers.push({
        id: 'tm' + pk,
        lat: pos.lat,
        lon: pos.lon,
        kind: 'avatar',
        text: initial(name(pk)),
        color: color(pk),
        ring: r ? ROLE[r].color : '#fff',
        size: 24,
        label: `${name(pk)}${stale ? ' · ' + ago(now - pos.t) : ''}`,
        faded: stale,
      });
    }

    // pings, grouped per hider
    const byHider: Record<string, PingRecord[]> = {};
    for (const p of st.pings) {
      if (st.caught[p.from]) continue;
      (byHider[p.from] ??= []).push(p);
    }
    for (const [pk, list] of Object.entries(byHider)) {
      const exact = list.filter((p) => p.exact);
      if (seeExact && exact.length) {
        const recent = exact.slice(-4);
        recent.forEach((p, i) => {
          const latest = i === recent.length - 1;
          markers.push(
            latest
              ? {
                  id: `px${pk}`,
                  lat: p.exact!.lat,
                  lon: p.exact!.lon,
                  kind: 'avatar',
                  text: initial(name(pk)),
                  color: color(pk),
                  ring: ROLE.hider.color,
                  size: 30,
                  pulse: now - p.at < 30_000,
                  label: `${name(pk)} · ${ago(now - p.at)}${p.why === 'spot' ? ' · spotted' : p.why === 'oob' ? ' · out of zone' : ''}${dark.has(pk) ? ' · ⚠ dark' : ''}`,
                }
              : { id: `px${pk}${i}`, lat: p.exact!.lat, lon: p.exact!.lon, color: color(pk), size: 10, faded: true },
          );
        });
        if (recent.length > 1) lines.push({ id: 'tr' + pk, points: recent.map((p) => p.exact!), color: color(pk) });
      }
      const fuzzy = list.filter((p) => p.fuzzy).at(-1);
      const lastExactAt = exact.at(-1)?.at ?? 0;
      if (seeFuzzy && fuzzy?.fuzzy && (!seeExact || fuzzy.at > lastExactAt + 1000)) {
        circles.push({
          id: 'fz' + pk,
          lat: fuzzy.fuzzy.center.lat,
          lon: fuzzy.fuzzy.center.lon,
          radius: fuzzy.fuzzy.radius,
          color: color(pk),
          dashed: true,
          fill: 0.14,
        });
        markers.push({
          id: 'fzl' + pk,
          lat: fuzzy.fuzzy.center.lat,
          lon: fuzzy.fuzzy.center.lon,
          kind: 'icon',
          icon: 'question',
          color: color(pk),
          size: 24,
          label: `${name(pk)} is somewhere here · ${ago(now - fuzzy.at)}`,
        });
      }
    }

    // my own last ping (hiders)
    const mine = session.myPings.at(-1);
    if (role === 'hider' && mine && !caughtMe) {
      markers.push({ id: 'mine', lat: mine.lat, lon: mine.lon, kind: 'icon', icon: 'pin', color: ROLE.hider.color, size: 22, label: `Your ping · ${ago(now - mine.t)}`, faded: true });
    }

    // each seeker's latest spot from the last 2 minutes (public)
    const lastSpot: Record<string, (typeof st.spots)[number]> = {};
    for (const sp of st.spots) if (now - sp.at < 120_000) lastSpot[sp.seeker] = sp;
    for (const sp of Object.values(lastSpot)) {
      markers.push({ id: `sp${sp.seeker}`, lat: sp.pos.lat, lon: sp.pos.lon, kind: 'icon', icon: 'eye', color: ROLE.seeker.color, size: 22, label: `${name(sp.seeker)} spotted ${name(sp.target)}`, faded: sp.ok === false });
    }

    if (paused && st.sos) {
      markers.push({ id: 'sos', lat: st.sos.pos.lat, lon: st.sos.pos.lon, kind: 'icon', icon: 'sos', color: C.bad, size: 34, label: `SOS · ${name(st.sos.by)}`, pulse: true });
    }

    return {
      zone: settings.zone,
      me: session.fix ? { lat: session.fix.lat, lon: session.fix.lon, acc: session.fix.acc } : null,
      markers,
      circles,
      lines,
      fit,
      follow,
    };
    // Recompute every tick: ages and positions change constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.version, now, fit, follow]);

  // ---- timer card ----
  let label = '';
  let big = '';
  let urgent = false;
  let progress = 0;
  if (phase === 'starting') {
    label = 'GET READY';
    big = formatClock(st.startAt! - now);
  } else if (paused) {
    label = 'GAME PAUSED';
    big = '— : —';
  } else if (phase === 'hiding') {
    label = role === 'hider' ? 'HIDE! HUNTERS RELEASED IN' : 'HIDERS ARE HIDING';
    big = formatClock(hideMs(settings) - gt);
    progress = gt / hideMs(settings);
  } else if (phase === 'hunting') {
    if (until === null) {
      label = 'FINAL STRETCH';
      big = formatClock(session.timeLeft(now));
    } else {
      label =
        role === 'hider' && !caughtMe
          ? until <= 30_000
            ? 'PING INCOMING'
            : 'YOU’LL BE PINGED IN'
          : forSeeker
            ? 'NEXT CIRCLE IN'
            : 'NEXT PING IN';
      big = formatClock(until);
      urgent = role === 'hider' && !caughtMe && until <= 30_000;
      progress = 1 - until / span;
    }
  }
  const free = Object.values(st.players).filter((p) => p.role === 'hider' && !st.caught[p.pk]).length;

  // ---- zone banner ----
  let banner: { text: string; color: string; icon: IconName; arrow?: number } | null = null;
  if (!paused && (phase === 'hiding' || phase === 'hunting') && role && !caughtMe) {
    if (oob === 'grace') {
      banner = { icon: 'alert', color: C.bad, text: `OUT OF ZONE — back in ${Math.ceil(session.graceLeft(now) / 1000)}s${back ? ` · ${compass(back.deg)} ${formatDistance(back.dist)}` : ''}`, arrow: back?.deg };
    } else if (oob === 'out') {
      banner =
        role === 'hider'
          ? { icon: 'broadcast', color: C.bad, text: 'You’re being broadcast — get back in!', arrow: back?.deg }
          : { icon: 'snowflake', color: C.bad, text: 'FROZEN — return to the zone', arrow: back?.deg };
    } else if (frozenFor > 0) {
      banner = { icon: 'snowflake', color: C.blue, text: `Frozen for ${Math.ceil(frozenFor / 1000)}s` };
    } else if (edge !== null && edge > -50) {
      banner = { icon: 'map-marker-alert-outline', color: C.warn, text: `Zone edge ${formatDistance(Math.max(0, -edge))} away` };
    }
  }
  if (!banner && bg === 'needs-permission' && (phase === 'hiding' || phase === 'hunting') && !caughtMe) {
    banner = { icon: 'cellphone-lock', color: C.warn, text: 'Background location is off — keep the app open' };
  }
  if (!session.fix && !sim) {
    banner = {
      icon: 'crosshairs-question',
      color: C.warn,
      text: locStatus === 'denied' ? 'Location is off — the game needs it' : 'Waiting for GPS…',
    };
  }

  const spotLeft = (st.lastSpotAt[me] ?? -Infinity) + settings.spotCooldownSec * 1000 - now;
  const frozen = oob === 'out' || frozenFor > 0;
  const canPlay = phase === 'hunting' && !paused && !frozen;

  const doLeave = () =>
    confirm('Leave the game?', 'The game carries on without you. You can rejoin from the home screen.', async () => {
      setSheet(null);
      await leave();
      router.dismissTo('/');
    }, 'Leave');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <GameMap
        scene={scene}
        onPress={(lat, lon) => sim && simMoveTo({ lat, lon })}
        onDrag={() => setFollow(false)}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.top} edges={['top']} pointerEvents="box-none">
        <View style={styles.hud} pointerEvents="box-none">
          <Row style={{ justifyContent: 'space-between' }}>
            {caughtMe ? (
              <View style={styles.caughtPill}>
                <Icon name="account-off-outline" size={16} color={C.muted} />
                <Text style={styles.caughtText}>CAUGHT</Text>
              </View>
            ) : (
              <RoleBadge role={role} filled />
            )}
            <Row>
              <RelayBadge session={session} />
              <IconButton icon="menu" label="Game menu" size={38} onPress={() => setSheet('menu')} />
            </Row>
          </Row>
          <View style={[styles.timer, urgent && styles.timerUrgent]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.timerLabel, urgent && { color: '#fff' }]}>{label}</Text>
              <Text style={styles.timerBig}>{big}</Text>
            </View>
            {phase === 'hunting' && (
              <View style={styles.timerStats}>
                <Row style={{ gap: 5 }}>
                  <Icon name="clock-outline" size={15} color={C.muted} />
                  <Text style={styles.timerStat}>{formatClock(session.timeLeft(now))}</Text>
                </Row>
                <Row style={{ gap: 5 }}>
                  <Icon name="incognito" size={15} color={ROLE.hider.color} />
                  <Text style={styles.timerStat}>{free} free</Text>
                </Row>
              </View>
            )}
            {progress > 0 && (
              <View style={styles.progress}>
                <View style={[styles.progressFill, { width: `${Math.min(1, progress) * 100}%`, backgroundColor: urgent ? '#fff' : C.accent }]} />
              </View>
            )}
          </View>
          {banner && (
            <View style={[styles.banner, { backgroundColor: banner.color }]}>
              <Icon name={banner.icon} size={18} color="#fff" />
              <Text style={styles.bannerText}>{banner.text}</Text>
              {banner.arrow !== undefined && (
                <Icon name="navigation" size={20} color="#fff" style={{ transform: [{ rotate: `${banner.arrow}deg` }] }} />
              )}
            </View>
          )}
          {toast && <Toast key={toast.key} text={toast.text} tone={toast.tone} onPress={() => setToast(null)} />}
        </View>
      </SafeAreaView>

      <SafeAreaView style={styles.bottom} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.fabs} pointerEvents="box-none">
          <IconButton icon={LAYER_ICON[layer]} label="Change map style" onPress={toggleLayer} />
          <IconButton icon="fit-to-screen-outline" label="Show whole zone" onPress={() => setFit((f) => f + 1)} />
          <IconButton icon="crosshairs-gps" label="Follow me" active={follow} onPress={() => setFollow((f) => !f)} />
        </View>
        <View style={styles.actions}>
          {sim && (
            <Row style={{ justifyContent: 'center', marginBottom: 4 }}>
              <Icon name="flask-outline" size={14} color={C.muted} />
              <Text style={T.muted}>Simulated GPS — tap the map to move</Text>
            </Row>
          )}
          {role === 'hider' && !caughtMe && (
            <Button title="My catch code" icon="qrcode" big color={ROLE.hider.color} onPress={() => setSheet('code')} />
          )}
          {role === 'hider' && caughtMe && (
            <Row style={styles.note}>
              <Icon name="account-off-outline" color={C.muted} />
              <Text style={[T.body, { flex: 1 }]}>
                You’re out — caught{caughtMe.by ? ` by ${st.players[caughtMe.by]?.name}` : ''}. Watch the rest of the hunt!
              </Text>
            </Row>
          )}
          {role === 'hunter' && (
            <Row>
              <Button
                title={frozen ? 'Frozen' : 'Scan to catch'}
                icon={frozen ? 'snowflake' : 'qrcode-scan'}
                big
                color={ROLE.hunter.color}
                style={{ flex: 1 }}
                disabled={!canPlay}
                onPress={() => setSheet('scan')}
              />
              <IconButton icon="dialpad" label="Catch with code" size={62} style={{ borderRadius: 18 }} onPress={() => canPlay && setSheet('type')} />
            </Row>
          )}
          {role === 'seeker' && (
            <View>
              <Button
                title={frozen ? 'Frozen' : spotLeft > 0 ? `Spot ready in ${Math.ceil(spotLeft / 1000)}s` : 'Spot a hider'}
                icon={frozen ? 'snowflake' : 'eye'}
                big
                color={ROLE.seeker.color}
                disabled={!canPlay || spotLeft > 0}
                onPress={() => setSheet('spot')}
              />
              {spotLeft > 0 && (
                <View style={[styles.progress, { position: 'relative', marginTop: 8, left: 0, right: 0, bottom: 0 }]}>
                  <View style={[styles.progressFill, { width: `${(1 - spotLeft / (settings.spotCooldownSec * 1000)) * 100}%`, backgroundColor: ROLE.seeker.color }]} />
                </View>
              )}
            </View>
          )}
          {!role && (
            <Row style={styles.note}>
              <Icon name="whistle" color={ROLE.referee.color} />
              <Text style={[T.body, { flex: 1 }]}>Referee view — you can see everyone’s pings.</Text>
            </Row>
          )}
        </View>
      </SafeAreaView>

      {phase === 'starting' && <RoleReveal session={session} seconds={Math.ceil((st.startAt! - now) / 1000)} />}

      {paused && (
        <View style={styles.overlay}>
          <View style={styles.pauseCard}>
            <View style={[styles.pauseIcon, { backgroundColor: alpha(st.sos ? C.bad : C.blue, 0.15) }]}>
              <Icon name={st.sos ? 'alert-octagon' : 'pause'} size={34} color={st.sos ? C.bad : C.blue} />
            </View>
            <Text style={[T.h2, { textAlign: 'center' }]}>
              {st.sos ? `SOS from ${st.players[st.sos.by]?.name}` : `Paused by ${st.players[st.pauses.at(-1)!.by]?.name ?? '?'}`}
            </Text>
            {st.sos && session.fix && (
              <Text style={[T.body, { textAlign: 'center' }]}>
                {formatDistance(distance(session.fix, st.sos.pos))} {compass(bearing(session.fix, st.sos.pos))} of you — shown on the map
              </Text>
            )}
            <Text style={[T.muted, { textAlign: 'center' }]}>The clock is stopped for everyone.</Text>
            <Button title="Resume" icon="play" color={C.good} onPress={() => session.resume()} />
          </View>
        </View>
      )}

      <CatchCodeSheet session={session} visible={sheet === 'code'} onClose={() => setSheet(null)} />
      <ScanSheet session={session} visible={sheet === 'scan'} onClose={() => setSheet(null)} onResult={say} />
      <CodeSheet session={session} visible={sheet === 'type'} onClose={() => setSheet(null)} onResult={say} />
      <SpotSheet session={session} visible={sheet === 'spot'} onClose={() => setSheet(null)} onResult={say} />
      <MenuSheet session={session} visible={sheet === 'menu'} onClose={() => setSheet(null)} onLeave={doLeave} />
    </View>
  );
}

function Toast({ text, tone, onPress }: { text: string; tone: FeedItem['tone']; onPress: () => void }) {
  const [y] = useState(() => new Animated.Value(-16));
  const [o] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const native = Platform.OS !== 'web';
    Animated.parallel([
      Animated.spring(y, { toValue: 0, useNativeDriver: native, speed: 18, bounciness: 8 }),
      Animated.timing(o, { toValue: 1, duration: 180, useNativeDriver: native }),
    ]).start();
  }, [y, o]);
  const t = TOAST[tone];
  return (
    <Animated.View style={{ transform: [{ translateY: y }], opacity: o }}>
      <Pressable onPress={onPress} style={[styles.toast, { borderColor: alpha(t.color, 0.6) }]}>
        <Icon name={t.icon} size={20} color={t.color} />
        <Text style={styles.toastText}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Big "you are a HUNTER" card during the 5-second start countdown. */
function RoleReveal({ session, seconds }: { session: Session; seconds: number }) {
  const role = session.role;
  const r = role ? ROLE[role] : ROLE.referee;
  const [scale] = useState(() => new Animated.Value(0.8));
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web', bounciness: 12 }).start();
  }, [scale]);
  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.reveal, { borderColor: r.color, transform: [{ scale }] }]}>
        <Text style={styles.revealSmall}>YOU ARE A</Text>
        <View style={[styles.revealIcon, { backgroundColor: alpha(r.color, 0.15) }]}>
          <Icon name={r.icon} size={56} color={r.color} />
        </View>
        <Text style={[styles.revealRole, { color: r.color }]}>{r.label.toUpperCase()}</Text>
        <Text style={[T.muted, { textAlign: 'center', fontSize: 15, lineHeight: 21 }]}>{r.blurb}</Text>
        <Text style={styles.revealCount}>{Math.max(0, seconds)}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  hud: { paddingHorizontal: 12, paddingTop: 6, gap: 8, maxWidth: 600, width: '100%', alignSelf: 'center' },
  caughtPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.card2,
    borderWidth: 1,
    borderColor: C.line,
  },
  caughtText: { color: C.muted, fontFamily: F.display, letterSpacing: 1 },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,14,20,0.94)',
    borderRadius: 20,
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  timerUrgent: { backgroundColor: 'rgba(200,40,40,0.95)', borderColor: C.bad },
  timerLabel: { color: C.muted, fontFamily: F.displaySemi, fontSize: 12, letterSpacing: 1.8 },
  timerBig: { color: '#fff', fontFamily: F.display, fontSize: 40, lineHeight: 46, fontVariant: ['tabular-nums'] },
  timerStats: { gap: 6, alignItems: 'flex-end' },
  timerStat: { color: C.text, fontFamily: F.display, fontSize: 15 },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  bannerText: { flex: 1, color: '#fff', fontFamily: F.bold, fontSize: 14 },
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
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  fabs: { alignSelf: 'flex-end', gap: 8, paddingHorizontal: 12, marginBottom: 10 },
  actions: {
    backgroundColor: 'rgba(10,14,20,0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 14,
    paddingBottom: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: C.line,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  note: { paddingVertical: 10, gap: 10 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,6,9,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  pauseCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.card,
    borderRadius: 26,
    padding: 22,
    gap: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  pauseIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  reveal: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 30,
    borderWidth: 2,
    padding: 26,
  },
  revealSmall: { color: C.muted, fontFamily: F.displaySemi, letterSpacing: 3, fontSize: 13 },
  revealIcon: { width: 104, height: 104, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  revealRole: { fontFamily: F.display, fontSize: 40, letterSpacing: 3 },
  revealCount: { color: '#fff', fontFamily: F.display, fontSize: 30, marginTop: 6 },
});
