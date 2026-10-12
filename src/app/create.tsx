import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDistance, zoneSpan } from '../engine/geo';
import { DEFAULT_SETTINGS, type LatLon, type Settings, type Zone } from '../engine/types';
import { currentPosition } from '../location';
import GameMap from '../map/GameMap';
import { LAYER_ICON, useMapLayer } from '../map/layer';
import { useApp } from '../store';
import Header from '../ui/Header';
import { Button, Card, Chip, Icon, IconButton, Label, Row, T } from '../ui/kit';
import { C, F, type IconName, alpha } from '../ui/theme';

const RADII = [150, 250, 400, 600, 800, 1000, 1500, 2000];
const JODHPUR: LatLon = { lat: 26.2934, lon: 73.0243 };

export default function CreateGame() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const session = useApp((s) => s.session);
  const createGame = useApp((s) => s.createGame);
  const existing = edit ? session?.settings : null;

  const [mode, setMode] = useState<'circle' | 'polygon'>(existing?.zone.kind ?? 'circle');
  const [center, setCenter] = useState<LatLon | null>(
    existing?.zone.kind === 'circle' ? existing.zone.center : null,
  );
  const [radius, setRadius] = useState(existing?.zone.kind === 'circle' ? existing.zone.radius : 400);
  const [points, setPoints] = useState<LatLon[]>(existing?.zone.kind === 'polygon' ? existing.zone.points : []);
  const [start, setStart] = useState<LatLon | null>(null);
  const [fit, setFit] = useState(existing ? 1 : 0);
  const [s, setS] = useState<Omit<Settings, 'zone'>>(existing ?? DEFAULT_SETTINGS);
  const { layer, toggle: toggleLayer } = useMapLayer();

  useEffect(() => {
    if (existing) return;
    currentPosition().then((p) => {
      const here = p ?? JODHPUR;
      setStart(here);
      setCenter((c) => c ?? here);
      setFit((f) => f + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zone = useMemo<Zone | null>(
    () =>
      mode === 'circle'
        ? center && { kind: 'circle', center, radius }
        : points.length >= 3
          ? { kind: 'polygon', points }
          : null,
    [mode, center, radius, points],
  );

  const span = zone ? zoneSpan(zone) : 0;
  const runMin = span / 3 / 60; // jogging pace ~3 m/s
  const tooBig = runMin > s.pingEveryMin * 1.5;

  const scene = useMemo(
    () => ({ zone, draft: mode === 'polygon' ? points : undefined, start: start ?? JODHPUR, fit }),
    [zone, mode, points, start, fit],
  );

  const save = () => {
    if (!zone) return;
    const settings: Settings = { ...s, zone };
    if (existing && session) {
      session.setSettings(settings);
      router.back();
    } else {
      createGame(settings);
      router.replace('/game');
    }
  };

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((o) => ({ ...o, [k]: v }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
      <Header title={existing ? 'Edit game' : 'New game'} />

      <View style={styles.mapBox}>
        <GameMap
          scene={scene}
          onPress={(lat, lon) => {
            if (mode === 'circle') setCenter({ lat, lon });
            else setPoints((p) => [...p, { lat, lon }]);
          }}
        />
        <View style={styles.modeSwitch}>
          <Chip label="Circle" icon="circle-outline" selected={mode === 'circle'} onPress={() => setMode('circle')} />
          <Chip label="Draw" icon="vector-polygon" selected={mode === 'polygon'} onPress={() => setMode('polygon')} />
        </View>
        <View style={styles.mapTools}>
          {mode === 'polygon' && (
            <>
              <IconButton icon="undo" label="Undo last point" onPress={() => setPoints((p) => p.slice(0, -1))} />
              <IconButton icon="delete-outline" label="Clear zone" onPress={() => setPoints([])} />
            </>
          )}
          <IconButton icon={LAYER_ICON[layer]} label="Change map style" onPress={toggleLayer} />
        </View>
        <View style={styles.hint} pointerEvents="none">
          <Icon name="gesture-tap" size={14} color="#fff" />
          <Text style={styles.hintText}>
            {mode === 'circle'
              ? 'Tap to move the zone'
              : points.length < 3
                ? `Tap the corners · ${points.length}/3+`
                : `${points.length} corners — tap to add more`}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <Label icon="map-marker-radius">Zone size</Label>
          {mode === 'circle' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {RADII.map((r) => (
                <Chip
                  key={r}
                  label={formatDistance(r * 2)}
                  selected={radius === r}
                  onPress={() => {
                    setRadius(r);
                    setFit((f) => f + 1);
                  }}
                />
              ))}
            </ScrollView>
          ) : null}
          <View style={[styles.infoRow, mode === 'circle' && { marginTop: 12 }]}>
            <Icon name="ruler" size={18} color={C.muted} />
            <Text style={[T.muted, { flex: 1 }]}>
              {zone
                ? `${formatDistance(span)} across · about ${Math.max(1, Math.round(runMin))} min to run end to end`
                : 'Draw at least 3 corners on the map.'}
            </Text>
          </View>
          {zone && tooBig && (
            <View style={[styles.infoRow, styles.warn]}>
              <Icon name="alert" size={18} color={C.warn} />
              <Text style={[T.muted, { flex: 1, color: C.warn }]}>
                Big for a {s.pingEveryMin}-minute ping — hiders could vanish between pings. Try a smaller zone.
              </Text>
            </View>
          )}
        </Card>

        <Card style={{ gap: 18 }}>
          <Option icon="timer-sand" label="Head start for hiders" values={[3, 5, 10, 15]} value={s.headStartMin} onChange={(v) => set('headStartMin', v)} />
          <Option icon="clock-outline" label="Hunt length" values={[20, 30, 45, 60, 90]} value={s.durationMin} onChange={(v) => set('durationMin', v)} />
          <Option icon="crosshairs-gps" label="Exact ping every" values={[3, 4, 5, 6]} value={s.pingEveryMin} onChange={(v) => set('pingEveryMin', v)} />
          <Row style={{ gap: 12 }}>
            <View style={styles.optIcon}>
              <Icon name="speedometer" size={20} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={T.strong}>Pings speed up</Text>
              <Text style={T.muted}>Faster later on — every minute in the final 5.</Text>
            </View>
            <Switch
              value={s.accelerate}
              onValueChange={(v) => set('accelerate', v)}
              trackColor={{ true: C.accent, false: C.line }}
              thumbColor="#fff"
            />
          </Row>
        </Card>

        {__DEV__ && (
          <Button
            title="Dev: quick test timings"
            icon="flash"
            kind="ghost"
            small
            onPress={() =>
              setS((o) => ({
                ...o,
                headStartMin: 0.25,
                durationMin: 4,
                pingEveryMin: 0.5,
                accelerate: false,
                spotCooldownSec: 40,
                graceSec: 10,
                freezeSec: 15,
              }))
            }
          />
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={existing ? 'Save changes' : 'Create lobby'}
          icon={existing ? 'check' : 'account-group'}
          big
          disabled={!zone}
          onPress={save}
        />
      </View>
    </SafeAreaView>
  );
}

function Option({
  icon,
  label,
  values,
  value,
  onChange,
}: {
  icon: IconName;
  label: string;
  values: number[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ gap: 12 }}>
        <View style={styles.optIcon}>
          <Icon name={icon} size={20} color={C.accent} />
        </View>
        <Text style={[T.strong, { flex: 1 }]}>{label}</Text>
        <Text style={styles.optValue}>{value >= 1 ? `${value} min` : `${Math.round(value * 60)}s`}</Text>
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        {values.map((v) => (
          <Chip key={v} label={`${v} min`} selected={v === value} onPress={() => onChange(v)} />
        ))}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  mapBox: { height: '40%', minHeight: 250 },
  modeSwitch: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6 },
  mapTools: { position: 'absolute', right: 10, bottom: 24, gap: 8 },
  hint: {
    position: 'absolute',
    left: 10,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(7,9,13,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  hintText: { color: '#fff', fontFamily: F.semi, fontSize: 12 },
  body: { padding: 16, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center', paddingBottom: 24 },
  infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  warn: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: alpha(C.warn, 0.1),
    borderWidth: 1,
    borderColor: alpha(C.warn, 0.35),
  },
  optIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: alpha(C.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  optValue: { color: C.text, fontFamily: F.display, fontSize: 16 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
});
