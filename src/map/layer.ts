import { create } from 'zustand';

import type { IconName } from '../ui/theme';
import type { MapLayer } from './mapHtml';

const ORDER: MapLayer[] = ['dark', 'streets', 'satellite'];

export const LAYER_ICON: Record<MapLayer, IconName> = {
  dark: 'weather-night',
  streets: 'map-outline',
  satellite: 'satellite-variant',
};

/** Dark map, street map or satellite — shared by every map in the app. */
export const useMapLayer = create<{ layer: MapLayer; toggle: () => void }>((set) => ({
  layer: 'dark',
  toggle: () => set((s) => ({ layer: ORDER[(ORDER.indexOf(s.layer) + 1) % ORDER.length] })),
}));
