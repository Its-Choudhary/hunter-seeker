import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { useMapLayer } from './layer';
import { type MapEvent, type MapScene, mapHtml } from './mapHtml';

export interface GameMapProps {
  scene: MapScene;
  onPress?: (lat: number, lon: number) => void;
  onDrag?: () => void;
  style?: ViewStyle;
}

export default function GameMap({ scene, onPress, onDrag, style }: GameMapProps) {
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const lastSent = useRef('');
  const html = useMemo(() => mapHtml(), []);
  const layer = useMapLayer((s) => s.layer);
  const json = JSON.stringify({ layer, ...scene });

  const push = () => {
    if (!ready.current || json === lastSent.current) return;
    lastSent.current = json;
    ref.current?.injectJavaScript(`window.__scene(${json});true;`);
  };
  useEffect(push, [json]);

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={ref}
        // A base URL gives tile servers a Referer, which OpenStreetMap requires.
        source={{ html, baseUrl: 'https://com.hunterseeker.app/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        overScrollMode="never"
        style={styles.web}
        onMessage={(e) => {
          let m: MapEvent;
          try {
            m = JSON.parse(e.nativeEvent.data);
          } catch {
            return;
          }
          if (m.type === 'ready') {
            ready.current = true;
            lastSent.current = '';
            push();
          } else if (m.type === 'press') onPress?.(m.lat, m.lon);
          else if (m.type === 'drag') onDrag?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: '#e5e9ec' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
