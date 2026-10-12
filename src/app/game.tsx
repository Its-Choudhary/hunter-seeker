import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import EndScreen from '../screens/EndScreen';
import LiveGame from '../screens/LiveGame';
import Lobby from '../screens/Lobby';
import { useApp, useSession } from '../store';
import { C } from '../ui/theme';

export default function Game() {
  const session = useSession();
  const saved = useApp((s) => s.saved);
  const ready = useApp((s) => s.ready);
  const rejoin = useApp((s) => s.rejoin);

  useEffect(() => {
    if (!session && saved) rejoin();
  }, [session, saved, rejoin]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (!session) return saved ? <View style={{ flex: 1, backgroundColor: C.bg }} /> : <Redirect href="/" />;

  const phase = session.phase();
  if (phase === 'lobby') return <Lobby session={session} />;
  if (session.outcome()) return <EndScreen session={session} />;
  return <LiveGame session={session} />;
}
