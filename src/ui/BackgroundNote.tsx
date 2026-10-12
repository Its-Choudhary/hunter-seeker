// Tells players, in plain words, when the app uses location in the background:
// only while a game is running, and never after it ends.
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { refreshBackgroundPermission, requestBackgroundPermission, useLocation } from '../location';
import { retryBackground } from '../store';
import { Button, Icon, T } from './kit';
import { C, F, alpha } from './theme';

const ALLOW = Platform.OS === 'ios' ? '“Always”' : '“Allow all the time”';

/** Lobby card: explains background location and asks for permission. */
export function BackgroundCard() {
  const bg = useLocation((s) => s.background);
  useEffect(() => {
    void refreshBackgroundPermission();
  }, []);

  if (bg === 'unsupported') {
    return (
      <Note
        icon="cellphone-lock"
        color={C.warn}
        title="Keep the app open during the game"
        text="This version can’t track you with the screen locked, so keep Hunter Seeker open on screen while you play. (The installed app can.)"
      />
    );
  }
  const ready = bg !== 'needs-permission';
  return (
    <Note
      icon={ready ? 'shield-check-outline' : 'map-marker-alert-outline'}
      color={ready ? C.good : C.warn}
      title={ready ? 'Background location ready' : 'Allow background location'}
      text="While the game is running, Hunter Seeker shares your location even with your phone locked, so pings keep working. It switches off automatically the moment the game ends or you leave."
    >
      {!ready && (
        <View style={{ marginTop: 10 }}>
          <Text style={[T.muted, { marginBottom: 8 }]}>Choose {ALLOW} on the next screen.</Text>
          <Button title="Allow background location" icon="map-marker-check" small onPress={requestBackgroundPermission} />
        </View>
      )}
    </Note>
  );
}

/** Status for the in-game menu (with a way to allow it mid-game). */
export function BackgroundStatus() {
  const bg = useLocation((s) => s.background);
  const on = bg === 'on';
  return (
    <View style={[styles.status, { borderColor: alpha(on ? C.good : C.warn, 0.4) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name={on ? 'map-marker-radius' : 'cellphone-lock'} size={18} color={on ? C.good : C.warn} />
        <Text style={[T.muted, { flex: 1, color: C.text }]}>
          {on
            ? 'Background location is ON for this game. It turns off automatically when the game ends.'
            : bg === 'needs-permission'
              ? 'Background location is not allowed — keep the app open on screen.'
              : 'Keep the app open on screen during the game.'}
        </Text>
      </View>
      {bg === 'needs-permission' && (
        <Button
          title={`Allow ${ALLOW}`}
          icon="map-marker-check"
          small
          kind="secondary"
          style={{ marginTop: 10 }}
          onPress={async () => {
            if (await requestBackgroundPermission()) retryBackground();
          }}
        />
      )}
    </View>
  );
}

/** Shown after the game: confirms nothing runs in the background any more. */
export function BackgroundOff() {
  if (useLocation((s) => s.background) === 'unsupported') return null;
  return (
    <View style={styles.off}>
      <Icon name="map-marker-off-outline" size={18} color={C.muted} />
      <Text style={[T.muted, { flex: 1 }]}>Game over — background location is off. The app no longer tracks you.</Text>
    </View>
  );
}

function Note({
  icon,
  color,
  title,
  text,
  children,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  color: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, { borderColor: alpha(color, 0.45), backgroundColor: alpha(color, 0.07) }]}>
      <View style={styles.head}>
        <Icon name={icon} size={20} color={color} />
        <Text style={[styles.title, { color }]}>{title}</Text>
      </View>
      <Text style={T.muted}>{text}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontFamily: F.bold, fontSize: 15 },
  status: { borderWidth: 1, borderRadius: 14, padding: 12 },
  off: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
});
