import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GameMapProps } from './GameMap';
import { useMapLayer } from './layer';
import { type MapEvent, mapHtml } from './mapHtml';

// Web version of the map: the same Leaflet page, in an iframe.
export default function GameMap({ scene, onPress, onDrag, style }: GameMapProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const lastSent = useRef('');
  const latest = useRef('');
  const cb = useRef({ onPress, onDrag });
  const html = useMemo(() => mapHtml(), []);
  const layer = useMapLayer((s) => s.layer);
  const json = JSON.stringify({ layer, ...scene });

  useEffect(() => {
    cb.current = { onPress, onDrag };
  }, [onPress, onDrag]);

  useEffect(() => {
    latest.current = json;
    send(frame.current, ready.current, lastSent, json);
  }, [json]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__hsmap) return;
      const m = e.data.data as MapEvent;
      if (m.type === 'ready') {
        ready.current = true;
        lastSent.current = '';
        send(frame.current, true, lastSent, latest.current);
      } else if (m.type === 'press') cb.current.onPress?.(m.lat, m.lon);
      else if (m.type === 'drag') cb.current.onDrag?.();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <View style={[styles.wrap, style]}>
      <iframe ref={frame} srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} title="map" />
    </View>
  );
}

function send(f: HTMLIFrameElement | null, ready: boolean, last: { current: string }, json: string) {
  if (!ready || !json || json === last.current) return;
  last.current = json;
  f?.contentWindow?.postMessage({ __hsscene: true, scene: JSON.parse(json) }, '*');
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: '#e5e9ec' },
});
