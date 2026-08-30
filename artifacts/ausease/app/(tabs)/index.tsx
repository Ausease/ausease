import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { BrandRule, NonInteractiveView } from '@/components/BrandDecor';
import { Header, Pill, Screen, styles as shared } from '@/components/Screen';
import { useOperations } from '@/context/OperationsContext';
import { useDemo } from '@/context/DemoContext';
import { useGetEnterpriseProfile, useGetOperationsCommandCenter } from '@workspace/api-client-react';

export default function HomeScreen() {
  const colors = useColors();
  const { tasks, issues } = useOperations();
  const { isDemoMode, isReadOnly, profile, data: demoData } = useDemo();
  const profileQuery = useGetEnterpriseProfile({ query: { queryKey: ['enterprise-profile'], enabled: !isDemoMode, retry: false } });
  const activeProfile = isDemoMode ? profile : profileQuery.data;
  const canSeeCommandCenter = activeProfile?.role === 'manager' || activeProfile?.role === 'reviewer' || activeProfile?.role === 'hq_admin';
  const commandCenterQuery = useGetOperationsCommandCenter({ query: { queryKey: ['command-center'], enabled: !isDemoMode && canSeeCommandCenter, retry: false } });
  const commandCenter = isDemoMode ? demoData.commandCenter : commandCenterQuery.data;
  const completed = tasks.filter((task) => task.done).length;
  const openIssues = issues.filter((issue) => issue.status !== 'Resolved').length;
  const displayName = isDemoMode ? profile.displayName : 'Alex';
  const storeName = isDemoMode ? profile.store?.name ?? 'All stores' : 'Sydney · Pitt Street';
  return <Screen scroll>
     <Header eyebrow="Tuesday · 25 August" title={`Good morning, ${displayName}`} action="bell" />
    {isDemoMode && <View testID="home-demo-context" style={[styles.demoNotice, { backgroundColor: colors.secondary }]}><Feather name={isReadOnly ? 'eye' : 'layers'} size={15} color={colors.secondaryForeground} /><Text style={[styles.demoNoticeText, { color: colors.secondaryForeground }]}>{isReadOnly ? `Read-only viewer · ${storeName} · changes are unavailable` : `Preview data · ${storeName} store context`}</Text></View>}
    <View style={[styles.storeCard, { backgroundColor: colors.foreground }]}>
       <NonInteractiveView style={[styles.storeOrbit, { borderColor: `${colors.accent}45` }]} />
       <View style={styles.storeTop}><View><Text style={styles.storeLabel}>{isDemoMode && profile.demoKey === 'hq_admin' ? 'YOUR WORKSPACE' : 'YOUR STORE'}</Text><Text style={styles.storeName}>{storeName}</Text></View><View style={styles.live}><View style={[styles.liveDot, { backgroundColor: colors.primary }]} /><Text style={[styles.liveText, { color: colors.accent }]}>LIVE</Text></View></View>
      <View style={styles.storeBottom}><Text style={styles.shift}>Morning shift · 8:00 am – 4:30 pm</Text><Feather name="arrow-up-right" color="#fff" size={19} /></View>
    </View>
     <View style={styles.editorialKicker}><Text style={[styles.kickerText, { color: colors.primary }]}>01 / STORE PULSE</Text><BrandRule color={colors.accent} /></View>
    <View style={styles.sectionHead}><Text style={[shared.sectionTitle, { color: colors.foreground }]}>Today at a glance</Text><Text style={[styles.link, { color: colors.primary }]}>View report</Text></View>
    <View style={styles.statsRow}>
      <Stat icon="check-circle" value={`${completed}/${tasks.length}`} label="Tasks done" tint={colors.primary} />
      <Stat icon="alert-circle" value={`${openIssues}`} label="Open issues" tint="#D48835" />
      <Stat icon="users" value="8" label="Team online" tint="#3B8B75" />
    </View>
     {canSeeCommandCenter && commandCenter && <View style={[styles.commandCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.commandHeader}><View><Text style={[styles.commandEyebrow, { color: colors.primary }]}>OPERATIONS COMMAND CENTER</Text><Text style={[styles.commandTitle, { color: colors.foreground }]}>Where attention is needed</Text></View><Feather name="bar-chart-2" size={18} color={colors.primary} /></View>
      <View style={styles.commandMetrics}>
         <CommandMetric value={`${commandCenter.metrics.tasksCompleted}/${commandCenter.metrics.tasksTotal}`} label="Tasks" colors={colors} />
         <CommandMetric value={`${commandCenter.metrics.openIssues}`} label="Issues" colors={colors} />
         <CommandMetric value={`${commandCenter.metrics.overdueRoutines}`} label="Overdue" colors={colors} />
         <CommandMetric value={`${commandCenter.metrics.openActions}`} label="Actions" colors={colors} />
      </View>
       <Text style={[styles.commandFooter, { color: colors.mutedForeground }]}>{commandCenter.metrics.approvalBottlenecks ? `${commandCenter.metrics.approvalBottlenecks} approval bottleneck${commandCenter.metrics.approvalBottlenecks === 1 ? '' : 's'} · ` : ''}{String(commandCenter.store.name ?? 'Current store')}</Text>
    </View>}
    <View style={styles.sectionHead}><Text style={[shared.sectionTitle, { color: colors.foreground }]}>Quick actions</Text></View>
    <View style={styles.actionGrid}>
      <Action icon="check-square" label="My tasks" color={colors.primary} onPress={() => router.push('/(tabs)/tasks')} />
      <Action testID="home-report-issue" icon="alert-triangle" label="Report issue" color="#D48835" disabled={isReadOnly} onPress={() => router.push('/(tabs)/issues')} />
      <Action icon="message-circle" label="Team chat" color="#3B8B75" onPress={() => router.push('/(tabs)/chat')} />
      <Action icon="zap" label="Ask ausease" color={colors.accentForeground} onPress={() => router.push('/(tabs)/assistant')} />
    </View>
    <View style={styles.sectionHead}><Text style={[shared.sectionTitle, { color: colors.foreground }]}>Needs attention</Text><Pill label={`${openIssues} open`} tone="warning" /></View>
    {issues.filter((issue) => issue.status !== 'Resolved').slice(0, 2).map((issue) => <Pressable key={issue.id} onPress={() => router.push('/(tabs)/issues')} style={({ pressed }) => [styles.issueRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? .7 : 1 }]}><View style={[styles.issueIcon, { backgroundColor: issue.urgent ? '#FCE4E0' : '#FFF0D7' }]}><Feather name={issue.urgent ? 'thermometer' : 'zap'} size={17} color={issue.urgent ? colors.destructive : '#A15D16'} /></View><View style={styles.issueCopy}><Text style={[styles.issueTitle, { color: colors.foreground }]}>{issue.title}</Text><Text style={[styles.issueMeta, { color: colors.mutedForeground }]}>{issue.area} · {issue.time}</Text></View><Feather name="chevron-right" color={colors.mutedForeground} size={18} /></Pressable>)}
  </Screen>;
}
function Stat({ icon, value, label, tint }: { icon: keyof typeof Feather.glyphMap; value: string; label: string; tint: string }) { const colors = useColors(); return <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name={icon} size={18} color={tint} /><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>; }
function Action({ icon, label, color, onPress, disabled = false, testID }: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void; disabled?: boolean; testID?: string }) { const colors = useColors(); return <Pressable testID={testID} onPress={onPress} disabled={disabled} accessibilityState={{ disabled }} style={({ pressed }) => [styles.action, { backgroundColor: colors.card, borderColor: colors.border, opacity: disabled || pressed ? .5 : 1 }]}><View style={[styles.actionIcon, { backgroundColor: color + '18' }]}><Feather name={icon} size={20} color={color} /></View><Text style={[styles.actionLabel, { color: colors.foreground }]}>{label}</Text></Pressable>; }
function CommandMetric({ value, label, colors }: { value: string; label: string; colors: ReturnType<typeof useColors> }) { return <View style={styles.commandMetric}><Text style={[styles.commandValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.commandLabel, { color: colors.mutedForeground }]}>{label}</Text></View>; }
const styles = StyleSheet.create({
  storeCard: { borderRadius: 22, padding: 20, marginBottom: 18, overflow: 'hidden' },
  storeOrbit: { position: 'absolute', right: -45, bottom: -38, width: 170, height: 95, borderWidth: 1, borderRadius: 100, transform: [{ rotate: '-12deg' }] },
  storeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  storeLabel: { color: '#8FB3D4', fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.2, marginBottom: 7 },
  storeName: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ffffff18', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 }, liveText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  storeBottom: { borderTopWidth: 1, borderTopColor: '#ffffff20', marginTop: 25, paddingTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shift: { color: '#C4CEDA', fontFamily: 'Inter_400Regular', fontSize: 12 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 3 },
  editorialKicker: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  kickerText: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 1 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 }, link: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 9, marginBottom: 26 }, stat: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 13, minHeight: 100 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 23, marginTop: 10 }, statLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 3 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 25 }, action: { width: '48%', borderRadius: 17, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  commandCard: { borderRadius: 17, borderWidth: 1, padding: 14, marginBottom: 25 }, commandHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, commandEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 }, commandTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 5 }, commandMetrics: { flexDirection: 'row', marginTop: 16, gap: 8 }, commandMetric: { flex: 1 }, commandValue: { fontFamily: 'Inter_700Bold', fontSize: 18 }, commandLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 }, commandFooter: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 13 },
  actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, actionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  demoNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 11, borderRadius: 12, marginBottom: 14 }, demoNoticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11 },
  issueRow: { borderRadius: 16, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 9, gap: 11 }, issueIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  issueCopy: { flex: 1 }, issueTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, issueMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
});
