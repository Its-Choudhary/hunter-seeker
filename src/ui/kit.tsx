import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import type { Role } from '../engine/types';
import { C, F, type IconName, ROLE, alpha } from './theme';

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

export function Icon({ name, size = 20, color = C.text, style }: { name: IconName; size?: number; color?: string; style?: TextStyle }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} style={style} />;
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  style,
  color,
  small,
  icon,
  big,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  color?: string;
  small?: boolean;
  big?: boolean;
  icon?: IconName;
}) {
  const fill = kind === 'primary' ? (color ?? C.accent) : kind === 'danger' ? C.bad : null;
  const fg = fill ? (fill === C.warn || fill === ROLE.seeker.color || fill === ROLE.hider.color ? '#06110c' : '#fff') : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        big && styles.btnBig,
        fill
          ? { backgroundColor: fill }
          : kind === 'secondary'
            ? { backgroundColor: C.card2, borderWidth: 1, borderColor: C.line }
            : { borderWidth: 1, borderColor: C.line },
        disabled && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.88 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={small ? 17 : big ? 24 : 20} color={fg} />}
          <Text
            style={[styles.btnText, { color: fg }, small && { fontSize: 14 }, big && { fontSize: 18, letterSpacing: 1 }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  active,
  color,
  size = 44,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  active?: boolean;
  color?: string;
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2 },
        active && { backgroundColor: color ?? C.blue, borderColor: color ?? C.blue },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      <Icon name={icon} size={size * 0.48} color={active ? '#fff' : C.text} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color = C.accent,
  style,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  style?: ViewStyle;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: alpha(color, 0.16), borderColor: color },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={15} color={selected ? color : C.muted} />}
      <Text style={[styles.chipText, selected && { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children, style, icon, right }: { children: ReactNode; style?: ViewStyle; icon?: IconName; right?: ReactNode }) {
  return (
    <View style={[styles.labelRow, style]}>
      {icon && <Icon name={icon} size={14} color={C.muted} />}
      <Text style={styles.label}>{children}</Text>
      {right && <View style={{ marginLeft: 'auto' }}>{right}</View>}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** A player's coloured initial, optionally ringed with their role colour. */
export function Avatar({ name, color, size = 38, role, dim }: { name: string; color: string; size?: number; role?: Role | null; dim?: boolean }) {
  const ring = role ? ROLE[role].color : 'transparent';
  return (
    <View
      style={{
        width: size + 6,
        height: size + 6,
        borderRadius: (size + 6) / 2,
        borderWidth: 2,
        borderColor: ring,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: F.display, fontSize: size * 0.46, color: '#07090d' }}>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

export function RoleBadge({ role, small, filled }: { role: Role | null; small?: boolean; filled?: boolean }) {
  const r = role ? ROLE[role] : ROLE.referee;
  return (
    <View
      style={[
        styles.badge,
        small && { paddingVertical: 4, paddingHorizontal: 8 },
        filled ? { backgroundColor: r.color, borderColor: r.color } : { backgroundColor: alpha(r.color, 0.14), borderColor: alpha(r.color, 0.5) },
      ]}
    >
      <Icon name={r.icon} size={small ? 13 : 16} color={filled ? '#07090d' : r.color} />
      <Text style={[styles.badgeText, { color: filled ? '#07090d' : r.color }, small && { fontSize: 11 }]}>
        {r.label.toUpperCase()}
      </Text>
    </View>
  );
}

export const T = StyleSheet.create({
  h1: { color: C.text, fontSize: 34, fontFamily: F.display, letterSpacing: 1.5 },
  h2: { color: C.text, fontSize: 22, fontFamily: F.display, letterSpacing: 0.5 },
  h3: { color: C.text, fontSize: 17, fontFamily: F.bold },
  body: { color: C.text, fontSize: 15, fontFamily: F.body },
  strong: { color: C.text, fontSize: 15, fontFamily: F.semi },
  muted: { color: C.muted, fontSize: 13, fontFamily: F.body, lineHeight: 18 },
  num: { color: C.text, fontFamily: F.display, fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  btn: {
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  btnSmall: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, gap: 6 },
  btnBig: { minHeight: 62, borderRadius: 18 },
  btnText: { fontSize: 16, fontFamily: F.bold, letterSpacing: 0.3 },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,21,29,0.92)',
    borderWidth: 1,
    borderColor: C.line,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card2,
  },
  chipText: { color: C.text, fontFamily: F.semi, fontSize: 14 },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  label: {
    color: C.muted,
    fontSize: 12,
    fontFamily: F.displaySemi,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  badgeText: { fontFamily: F.display, fontSize: 13, letterSpacing: 1 },
});
