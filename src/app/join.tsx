import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { parseJoinCode } from '../engine/crypto';
import { useApp } from '../store';
import Header from '../ui/Header';
import ScanFrame from '../ui/ScanFrame';
import { Button, Card, Icon, Label, T } from '../ui/kit';
import { C, F } from '../ui/theme';

export default function JoinGame() {
  const joinGame = useApp((s) => s.joinGame);
  const [perm, requestPerm] = useCameraPermissions();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const done = useRef(false);

  const tryJoin = (raw: string) => {
    if (done.current) return;
    const secret = parseJoinCode(raw);
    if (!secret) {
      setError("That doesn't look like a Hunter Seeker invite.");
      return;
    }
    done.current = true;
    joinGame(secret);
    router.replace('/game');
  };

  const canScan = Platform.OS !== 'web';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Join a game" />
      <View style={styles.body}>
        {canScan && (
          <View style={styles.camera}>
            {perm?.granted ? (
              <>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={(r) => tryJoin(r.data)}
                />
                <ScanFrame />
                <Text style={styles.camHint}>Point at the QR on a friend’s lobby screen</Text>
              </>
            ) : (
              <View style={styles.center}>
                <Icon name="qrcode-scan" size={54} color={C.accent} />
                <Text style={[T.h3, { textAlign: 'center' }]}>Scan a friend’s QR</Text>
                <Text style={[T.muted, { textAlign: 'center', marginBottom: 6 }]}>
                  Anyone already in the lobby can show it.
                </Text>
                <Button title="Allow camera" icon="camera" onPress={requestPerm} />
              </View>
            )}
          </View>
        )}
        <Card>
          <Label icon="keyboard-outline">{canScan ? 'Or paste an invite' : 'Paste the invite code or link'}</Label>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError('');
            }}
            placeholder="HS1.xxxxxxxxxxxxxxxxxxxxxx"
            placeholderTextColor={C.dim}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={() => tryJoin(text)}
          />
          {!!error && <Text style={[T.muted, { color: C.bad, marginTop: 8 }]}>{error}</Text>}
          <Button title="Join" icon="login" style={{ marginTop: 12 }} disabled={!text.trim()} onPress={() => tryJoin(text)} />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14, maxWidth: 520, width: '100%', alignSelf: 'center' },
  camera: {
    height: 340,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  camHint: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    color: '#fff',
    fontFamily: F.semi,
    fontSize: 13,
    backgroundColor: 'rgba(7,9,13,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  input: {
    backgroundColor: C.card2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    color: C.text,
    fontSize: 16,
    fontFamily: F.medium,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
