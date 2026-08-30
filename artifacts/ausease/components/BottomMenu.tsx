import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDemo } from '@/context/DemoContext';

type SliderMenuProps = {
  visible: boolean;
  onClose: () => void;
};

export function SliderMenu({ visible, onClose }: SliderMenuProps) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDemoMode, profile } = useDemo();
  const translateY = useRef(new Animated.Value(340)).current;

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(340);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 180 }).start();
  }, [translateY, visible]);

  const goTo = (href: string) => {
    onClose();
    router.push(href as never);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable testID="menu-sheet-backdrop" style={[styles.backdrop, { backgroundColor: `${colors.foreground}88` }]} onPress={onClose} />
        <Animated.View testID="menu-slider" style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 14) + 8, transform: [{ translateY }] }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>AUSEASE MENU</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Quick menu</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Keep the daily flow clear. Everything else lives here.</Text>
            </View>
            <Pressable testID="close-menu-slider" accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.secondary }]}>
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>

          {isDemoMode && (
            <View style={[styles.profileStrip, { backgroundColor: colors.foreground }]}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}><Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{profile.initials}</Text></View>
              <View style={styles.profileCopy}>
                <Text style={styles.profileName}>{profile.displayName}</Text>
                <Text style={[styles.profileRole, { color: colors.accent }]}>{profile.roleLabel} · {profile.store?.name ?? 'All stores'}</Text>
              </View>
              <Feather name="eye" size={15} color={colors.accent} />
            </View>
          )}

          <View style={styles.menuItems}>
            <Pressable testID="slider-menu-control-room" accessibilityRole="button" onPress={() => goTo('/(tabs)/more')} style={({ pressed }) => [styles.menuItem, { borderColor: colors.border, backgroundColor: colors.background, opacity: pressed ? .7 : 1 }]}>
              <View style={[styles.itemIcon, { backgroundColor: colors.secondary }]}><Feather name="sliders" size={18} color={colors.primary} /></View>
              <View style={styles.itemCopy}><Text style={[styles.itemTitle, { color: colors.foreground }]}>Control room</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>Profile, demo access, audit, and admin tools</Text></View>
              <Feather name="arrow-up-right" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable testID="slider-menu-store-settings" accessibilityRole="button" onPress={() => goTo('/store-settings')} style={({ pressed }) => [styles.menuItem, { borderColor: colors.border, backgroundColor: colors.background, opacity: pressed ? .7 : 1 }]}>
              <View style={[styles.itemIcon, { backgroundColor: colors.secondary }]}><Feather name="map-pin" size={18} color={colors.primary} /></View>
              <View style={styles.itemCopy}><Text style={[styles.itemTitle, { color: colors.foreground }]}>Store settings</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>Location, geofence, and store readiness</Text></View>
              <Feather name="arrow-up-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={[styles.footer, { color: colors.mutedForeground }]}>Press Menu any time to return here.</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function MenuTrigger({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable testID="bottom-menu-trigger" accessibilityRole="button" accessibilityLabel="Open menu" onPress={onPress} style={({ pressed }) => [styles.trigger, { opacity: pressed ? .65 : 1 }]}>
      <View style={[styles.triggerIcon, { backgroundColor: colors.secondary }]}><Feather name="menu" size={20} color={colors.primary} /></View>
      <Text style={[styles.triggerLabel, { color: colors.mutedForeground }]}>Menu</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: .16, shadowRadius: 22, elevation: 18 },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 17 },
  eyebrow: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 1.1, marginBottom: 5 },
  title: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 25, letterSpacing: -.5 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, maxWidth: 260, marginTop: 4 },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  profileStrip: { borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  profileCopy: { flex: 1 },
  profileName: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
  profileRole: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 },
  menuItems: { gap: 9 },
  menuItem: { minHeight: 65, borderRadius: 15, borderWidth: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1 },
  itemTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  itemSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  footer: { fontFamily: 'SpaceMono_400Regular', fontSize: 9, textAlign: 'center', marginTop: 15 },
  trigger: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  triggerIcon: { width: 29, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  triggerLabel: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: .2 },
});