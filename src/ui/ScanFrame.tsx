import { StyleSheet, View } from 'react-native';

import { C } from './theme';

/** Corner brackets drawn over the camera so it reads as a scanner. */
export default function ScanFrame({ size = 220, color = C.accent }: { size?: number; color?: string }) {
  const arm = 34;
  const corner = (pos: object, borders: object) => (
    <View style={[{ position: 'absolute', width: arm, height: arm, borderColor: color }, pos, borders]} />
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={{ width: size, height: size }}>
        {corner({ top: 0, left: 0 }, { borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 })}
        {corner({ top: 0, right: 0 }, { borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 })}
        {corner({ bottom: 0, left: 0 }, { borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 })}
        {corner({ bottom: 0, right: 0 }, { borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 })}
      </View>
    </View>
  );
}
