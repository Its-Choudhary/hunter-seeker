import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, IconButton } from './kit';
import { C, F, type IconName } from './theme';

/** Bottom sheet with a grab handle, title row and close button. */
export default function Sheet({
  visible,
  onClose,
  title,
  icon,
  color = C.accent,
  children,
  scroll,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  icon?: IconName;
  color?: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          {title && (
            <View style={styles.head}>
              {icon && (
                <View style={[styles.headIcon, { backgroundColor: color + '22' }]}>
                  <Icon name={icon} size={20} color={color} />
                </View>
              )}
              <Text style={styles.title}>{title.toUpperCase()}</Text>
              <IconButton icon="close" label="Close" size={36} onPress={onClose} />
            </View>
          )}
          {scroll ? (
            <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 16, paddingBottom: 6 }}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.text, fontFamily: F.display, fontSize: 19, letterSpacing: 1.2 },
});
