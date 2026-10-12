import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from './kit';
import { C, F } from './theme';

/** Screen title bar: back button, title, optional right-side content. */
export default function Header({ title, back = true, right }: { title: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {back && <IconButton icon="chevron-left" label="Back" size={40} onPress={() => router.back()} />}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  side: { minWidth: 72 },
  title: { flex: 1, textAlign: 'center', color: C.text, fontFamily: F.display, fontSize: 18, letterSpacing: 2 },
});
