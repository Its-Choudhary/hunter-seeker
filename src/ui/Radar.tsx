import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { C, ROLE } from './theme';

const native = Platform.OS !== 'web';

function wedge(r: number, from: number, to: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = r + r * Math.cos(rad(from));
  const y1 = r + r * Math.sin(rad(from));
  const x2 = r + r * Math.cos(rad(to));
  const y2 = r + r * Math.sin(rad(to));
  return `M${r} ${r} L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

const BLIPS = [
  { a: -40, d: 0.62, color: ROLE.hider.color },
  { a: 70, d: 0.35, color: ROLE.hunter.color },
  { a: 160, d: 0.78, color: ROLE.hider.color },
  { a: 230, d: 0.5, color: ROLE.seeker.color },
];

/** Decorative radar sweep for the home screen. */
export default function Radar({ size = 220 }: { size?: number }) {
  const r = size / 2;
  const [spin] = useState(() => new Animated.Value(0));
  const [blips] = useState(() => BLIPS.map(() => new Animated.Value(0)));

  useEffect(() => {
    const sweep = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 3600, easing: Easing.linear, useNativeDriver: native }),
    );
    sweep.start();
    const pulses = blips.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 900),
          Animated.timing(v, { toValue: 1, duration: 250, useNativeDriver: native }),
          Animated.timing(v, { toValue: 0, duration: 1800, useNativeDriver: native }),
          Animated.delay((BLIPS.length - 1 - i) * 900),
        ]),
      ),
    );
    pulses.forEach((p) => p.start());
    return () => {
      sweep.stop();
      pulses.forEach((p) => p.stop());
    };
  }, [spin, blips]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={r} cy={r} r={r - 1} fill="#0b1a14" stroke={C.good} strokeOpacity={0.35} strokeWidth={1.5} />
        {[0.75, 0.5, 0.25].map((k) => (
          <Circle key={k} cx={r} cy={r} r={(r - 1) * k} fill="none" stroke={C.good} strokeOpacity={0.18} />
        ))}
        <Line x1={r} y1={4} x2={r} y2={size - 4} stroke={C.good} strokeOpacity={0.14} />
        <Line x1={4} y1={r} x2={size - 4} y2={r} stroke={C.good} strokeOpacity={0.14} />
      </Svg>
      <Animated.View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate }] }}>
        <Svg width={size} height={size}>
          <G>
            {Array.from({ length: 14 }, (_, i) => (
              <Path key={i} d={wedge(r - 2, -90 - (i + 1) * 4, -90 - i * 4)} fill={C.good} fillOpacity={0.32 * (1 - i / 14) ** 2} />
            ))}
            <Line x1={r} y1={r} x2={r} y2={2} stroke={C.good} strokeWidth={2} strokeOpacity={0.9} />
          </G>
        </Svg>
      </Animated.View>
      {BLIPS.map((b, i) => {
        const rad = (b.a * Math.PI) / 180;
        const x = r + Math.cos(rad) * r * b.d;
        const y = r + Math.sin(rad) * r * b.d;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: x - 6,
              top: y - 6,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: b.color,
              opacity: blips[i],
              shadowColor: b.color,
              shadowOpacity: 0.9,
              shadowRadius: 8,
            }}
          />
        );
      })}
      <View
        style={{
          position: 'absolute',
          left: r - 5,
          top: r - 5,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: C.good,
        }}
      />
    </View>
  );
}
