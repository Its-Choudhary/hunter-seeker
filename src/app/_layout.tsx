import { ChakraPetch_600SemiBold, ChakraPetch_700Bold } from '@expo-google-fonts/chakra-petch';
import { Hind_500Medium, Hind_600SemiBold, Hind_700Bold } from '@expo-google-fonts/hind';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useApp } from '../store';
import { C } from '../ui/theme';

export default function RootLayout() {
  const init = useApp((s) => s.init);
  const [fontsLoaded, fontError] = useFonts({
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Hind_500Medium,
    Hind_600SemiBold,
    Hind_700Bold,
    ...MaterialCommunityIcons.font,
  });

  useEffect(() => {
    init();
    // Phones drop network connections in the background; reconnect on return.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') useApp.getState().session?.wake();
    });
    return () => sub.remove();
  }, [init]);

  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }}
      />
    </SafeAreaProvider>
  );
}
