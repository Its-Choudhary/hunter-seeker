import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { Role } from '../engine/types';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// Night-ops palette: near-black surfaces, one hot brand colour, a colour per role.
export const C = {
  bg: '#07090d',
  card: '#10151d',
  card2: '#171e29',
  line: '#232d3b',
  border: '#232d3b',
  text: '#eef3f8',
  muted: '#8592a3',
  dim: '#566273',
  accent: '#ff5a36',
  good: '#2ee59d',
  warn: '#ffb020',
  bad: '#ff4d4d',
  blue: '#3b8bff',
  ice: '#7cc8ff',
};

export const F = {
  display: 'ChakraPetch_700Bold',
  displaySemi: 'ChakraPetch_600SemiBold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
};

export const ROLE: Record<
  Role | 'referee',
  { label: string; color: string; icon: IconName; blurb: string }
> = {
  hider: {
    label: 'Hider',
    color: '#2ee59d',
    icon: 'incognito',
    blurb: 'Stay hidden. Your exact spot is pinged to hunters on a timer.',
  },
  hunter: {
    label: 'Hunter',
    color: '#ff4d4d',
    icon: 'crosshairs-gps',
    blurb: 'Gets exact pings. Only hunters catch — scan the hider’s code.',
  },
  seeker: {
    label: 'Seeker',
    color: '#ffb020',
    icon: 'radar',
    blurb: 'Gets rough circles more often. See a hider? Spot them.',
  },
  referee: {
    label: 'Referee',
    color: '#8fa3b8',
    icon: 'whistle',
    blurb: 'Sees everything. Doesn’t play.',
  },
};

export const PLAYER_COLORS = [
  '#2ee59d',
  '#22c3ee',
  '#a78bfa',
  '#fb923c',
  '#f472b6',
  '#facc15',
  '#34d399',
  '#818cf8',
];

/** Colour with alpha, from #rrggbb. */
export const alpha = (hex: string, a: number) =>
  hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
