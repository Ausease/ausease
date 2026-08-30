import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { BrandBackdrop, BrandRule } from '@/components/BrandDecor';
import { AuseaseLogo } from '@/components/AuseaseLogo';
import { useDemo } from '@/context/DemoContext';
import { useRouter } from 'expo-router';

export function Screen({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isDemoMode } = useDemo();
  const { ScrollView } = require('react-native') as typeof import('react-native');
  return (
    <View style={[styles.shell, { backgroundColor: colors.background }]}>
      <BrandBackdrop />
      {scroll
        ? <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 104 }]} showsVerticalScrollIndicator={false}>{isDemoMode && <DemoSwitcher />}{children}</ScrollView>
        : <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 104 }]}>{isDemoMode && <DemoSwitcher />}{children}</View>}
    </View>
  );
}

function DemoSwitcher() {
  const colors = useColors();
  const router = useRouter();
  const { profile, profileOptions, switchProfile, exitDemo, isReadOnly } = useDemo();
  const [visible, setVisible] = useState(false);
  return (
    <>
      <View style={[styles.demoBar, { backgroundColor: colors.foreground }]}>
        <View style={styles.demoBarCopy}>
          <View style={styles.demoLabelRow}><View style={[styles.demoDot, { backgroundColor: colors.accent }]} /><Text style={[styles.demoLabel, { color: colors.accent }]}>DEMO WORKSPACE</Text></View>
          <Text style={styles.demoProfile}>
            {profile.displayName} · {profile.roleLabel} · {profile.store?.name ?? 'All stores'}{isReadOnly ? ' · changes unavailable' : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Switch demo profile" onPress={() => setVisible(true)} style={[styles.demoSwitchButton, { backgroundColor: colors.accent }]}>
          <Text style={[styles.demoSwitchText, { color: colors.accentForeground }]}>Switch</Text>
          <Feather name="chevron-down" size={14} color={colors.accentForeground} />
        </Pressable>
      </View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={[styles.demoModalBackdrop, { backgroundColor: `${colors.foreground}88` }]} onPress={() => setVisible(false)}>
          <Pressable style={[styles.demoModal, { backgroundColor: colors.card }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.demoModalHeader}>
              <View><Text style={[styles.demoModalTitle, { color: colors.foreground }]}>Preview profile</Text><Text style={[styles.demoModalCopy, { color: colors.mutedForeground }]}>See the app from another role.</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close profile switcher" onPress={() => setVisible(false)}><Feather name="x" size={21} color={colors.foreground} /></Pressable>
            </View>
            {profileOptions.map((option) => {
              const selected = option.demoKey === profile.demoKey;
              return (
                <Pressable
                  key={option.demoKey}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { switchProfile(option.demoKey); setVisible(false); }}
                  style={({ pressed }) => [styles.demoOption, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}12` : colors.card, opacity: pressed ? .7 : 1 }]}
                >
                  <View style={[styles.demoAvatar, { backgroundColor: selected ? colors.primary : colors.secondary }]}><Text style={[styles.demoAvatarText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{option.initials}</Text></View>
                  <View style={styles.demoOptionCopy}><Text style={[styles.demoOptionName, { color: colors.foreground }]}>{option.displayName}</Text><Text style={[styles.demoOptionRole, { color: colors.mutedForeground }]}>{option.roleLabel} · {option.store?.name ?? 'All stores'}</Text></View>
                  {selected && <Feather name="check-circle" size={18} color={colors.primary} />}
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" onPress={() => { exitDemo(); setVisible(false); router.replace('/(auth)/sign-in' as never); }} style={[styles.exitDemo, { borderColor: colors.border }]}>
              <Feather name="log-out" size={16} color={colors.foreground} />
              <Text style={[styles.exitDemoText, { color: colors.foreground }]}>Exit demo workspace</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
export function Header({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={styles.header}><View style={styles.headerTop}><View style={styles.logoLockup}><AuseaseLogo width={91} height={20} /><BrandRule color={colors.accent} /></View>{action && <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><Feather name={action as keyof typeof Feather.glyphMap} size={20} color={colors.foreground} /></Pressable>}</View>{eyebrow && <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>}<Text style={[styles.title, { color: colors.foreground }]}>{title}</Text></View>;
}
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warning' | 'success' | 'danger' }) {
  const colors = useColors();
  const palette = tone === 'warning' ? { bg: `${colors.ochre}22`, text: colors.ochre } : tone === 'success' ? { bg: colors.accent, text: colors.accentForeground } : tone === 'danger' ? { bg: colors.coralSoft, text: colors.destructive } : { bg: colors.secondary, text: colors.mutedForeground };
  return <View style={[styles.pill, { backgroundColor: palette.bg }]}><Text style={[styles.pillText, { color: palette.text }]}>{label}</Text></View>;
}
export const styles = StyleSheet.create({
  shell: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1 },
  header: { marginBottom: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
  logoLockup: { gap: 6, alignItems: 'flex-start' },
  headerLogo: { width: 91, height: 29 },
  sectionTitle: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 17, letterSpacing: -0.25 },
  eyebrow: { fontFamily: 'SpaceMono_700Bold', fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 7 },
  title: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 30, letterSpacing: -0.8 },
  iconButton: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pill: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  demoBar: { borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  demoBarCopy: { flex: 1 },
  demoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  demoDot: { width: 6, height: 6, borderRadius: 3 },
  demoLabel: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: .9 },
  demoProfile: { color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 4 },
  demoSwitchButton: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  demoSwitchText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  demoModalBackdrop: { flex: 1, justifyContent: 'center', padding: 20 },
  demoModal: { borderRadius: 20, padding: 18 },
  demoModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  demoModalTitle: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 22 },
  demoModalCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  demoOption: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  demoAvatar: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  demoAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  demoOptionCopy: { flex: 1 },
  demoOptionName: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  demoOptionRole: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  exitDemo: { borderWidth: 1, borderRadius: 12, minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 7 },
  exitDemoText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});