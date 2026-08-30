import React from 'react';
import { Alert, AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { getGetTodayRoutinesQueryKey, getGetOperationsCommandCenterQueryKey, useCompleteRoutine, useGetPublishedChecklists, useGetTodayRoutines, useRegisterRoutineEvidence, useRequestRoutineEvidenceUploadUrl, useUpdateChecklistProgress, type RoutineEvidence } from '@workspace/api-client-react';
import { useAuth } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { Header, Pill, Screen } from '@/components/Screen';
import { BrandRule, NonInteractiveView } from '@/components/BrandDecor';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useOperations } from '@/context/OperationsContext';
import { usePresence } from '@/context/PresenceContext';
import { useDemo, type DemoChecklist } from '@/context/DemoContext';
import { flushPendingRoutineEvidence, getPendingRoutineEvidenceKey, queuePendingRoutineEvidence, RoutineEvidenceUnavailableError, type PendingRoutineEvidence } from '@/context/routine-evidence-queue';

const accessCopy = {
  store_not_configured: ['Store location not configured', 'Ask your administrator to add the store geofence.'],
  user_not_checked_in: ['Check in at your store', 'Allow location access, then check in from inside the store.'],
  manager_not_checked_in: ['Waiting for your store manager', 'Your manager must also check in at this store before checklists can open.'],
} as const;

export default function TasksScreen() {
  const colors = useColors();
  const { userId } = useAuth();
  const { tasks, toggleTask } = useOperations();
  const { isDemoMode, isReadOnly, profile, data: demoData, toggleChecklistItem, createChecklistDraft, publishChecklist } = useDemo();
  const { status, permission, checkingIn, loading, error, checkIn, refresh } = usePresence();
  const queryClient = useQueryClient();
  const routinesQuery = useGetTodayRoutines({ query: { queryKey: getGetTodayRoutinesQueryKey(), enabled: !isDemoMode, retry: false } });
  const publishedChecklistsQuery = useGetPublishedChecklists({ query: { queryKey: ['published-checklists'], enabled: !isDemoMode, retry: false } });
  const { mutateAsync: updateChecklistProgressAsync } = useUpdateChecklistProgress();
  const { mutateAsync: completeRoutineAsync, isPending: completeRoutinePending } = useCompleteRoutine();
  const { mutateAsync: requestEvidenceUploadAsync } = useRequestRoutineEvidenceUploadUrl();
  const { mutateAsync: registerEvidenceAsync } = useRegisterRoutineEvidence();
  const done = tasks.filter((task) => task.done).length;
  const permissionBlocked = permission !== null && !permission.granted;
  const locked = permissionBlocked || !status?.allowed || (isDemoMode && isReadOnly);
  const evidenceQueueKey = userId && status?.store?.id ? getPendingRoutineEvidenceKey(userId, status.store.id) : null;
  const geofencePaused = status?.store?.geofenceEnabled === false;
  const reason = status?.reason ?? 'user_not_checked_in';
  const effectiveReason = permissionBlocked ? 'user_not_checked_in' : reason;
  const [title, subtitle] = effectiveReason === 'ready' ? ['Store presence verified', 'Both required team members are present.'] : accessCopy[effectiveReason];
  const uploadEvidence = React.useCallback(async (routineId: string, asset: ImagePicker.ImagePickerAsset): Promise<RoutineEvidence> => {
    let blob: Blob;
    try {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new RoutineEvidenceUnavailableError();
      blob = await response.blob();
    } catch {
      throw new RoutineEvidenceUnavailableError();
    }
    const contentType = asset.mimeType ?? 'image/jpeg';
    const fileName = asset.fileName ?? `routine-evidence-${Date.now()}.jpg`;
    const upload = await requestEvidenceUploadAsync({ routineId, data: { fileName, contentType, size: asset.fileSize ?? blob.size } });
    const put = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    if (!put.ok) throw new Error('The evidence photo could not be uploaded.');
    return registerEvidenceAsync({ routineId, data: { objectPath: upload.objectPath, fileName, contentType } });
  }, [registerEvidenceAsync, requestEvidenceUploadAsync]);
  const flushPendingEvidence = React.useCallback(async () => {
    if (!evidenceQueueKey) return;
    const result = await flushPendingRoutineEvidence(AsyncStorage, async (item) => {
      let evidenceId = item.evidenceId;
      if (!evidenceId) {
        const evidence = await uploadEvidence(item.routineId, { uri: item.uri, fileName: item.fileName, mimeType: item.mimeType, fileSize: item.fileSize, width: 1, height: 1 });
        evidenceId = evidence.id;
      }
      await completeRoutineAsync({ routineId: item.routineId, data: { evidenceCount: 1, evidenceIds: [evidenceId] } });
    }, evidenceQueueKey);
    if (result.unavailable.length > 0) {
      Alert.alert('Evidence unavailable', `${result.unavailable.length} queued photo${result.unavailable.length === 1 ? ' was' : 's were'} removed because the local file could not be read. Capture the photo again if needed.`);
    }
    if (result.uploaded > 0) {
      await queryClient.invalidateQueries({ queryKey: getGetTodayRoutinesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetOperationsCommandCenterQueryKey() });
    }
  }, [completeRoutineAsync, evidenceQueueKey, queryClient, uploadEvidence]);
  const { refetch: refetchRoutines } = routinesQuery;
  const retryPendingEvidence = React.useCallback(async () => {
    if (isDemoMode || !evidenceQueueKey) return;
    const result = await refetchRoutines();
    if (result.isSuccess) await flushPendingEvidence();
  }, [evidenceQueueKey, flushPendingEvidence, isDemoMode, refetchRoutines]);
  React.useEffect(() => {
    if (!isDemoMode && routinesQuery.isSuccess) void flushPendingEvidence();
  }, [flushPendingEvidence, isDemoMode, routinesQuery.isSuccess]);
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void retryPendingEvidence();
    });
    return () => subscription.remove();
  }, [retryPendingEvidence]);
  const routines = isDemoMode ? demoData.routines.routines : routinesQuery.data?.routines ?? [];
  const checklists: DemoChecklist[] = isDemoMode ? demoData.checklists : (publishedChecklistsQuery.data?.checklists ?? []).map((checklist) => ({
    id: checklist.id,
    templateId: checklist.id,
    versionId: checklist.versionId,
    version: checklist.version,
    status: 'published' as const,
    effectiveDate: checklist.effectiveAt ? new Date(checklist.effectiveAt).toLocaleDateString() : 'Now',
    assignedStores: [],
    assignedRoles: [checklist.assignedRole],
    routineId: '',
    name: checklist.name,
    summary: checklist.summary,
    owner: checklist.owner,
    evidenceLabel: checklist.evidenceRule,
    items: checklist.items.map((item) => ({ id: item.id, title: item.title, guidance: item.guidance, required: item.required ?? true, done: item.completed })),
  }));
  const [expandedChecklistId, setExpandedChecklistId] = React.useState<string | null>(null);
  const [liveChecklistOverrides, setLiveChecklistOverrides] = React.useState<Record<string, boolean>>({});
  const [savingChecklistItem, setSavingChecklistItem] = React.useState<string | null>(null);
  const [dismissedStandardKeys, setDismissedStandardKeys] = React.useState<Record<string, true>>({});
  const [studioVisible, setStudioVisible] = React.useState(false);
  const [studioTemplateId, setStudioTemplateId] = React.useState<string | undefined>();
  const [studioName, setStudioName] = React.useState('');
  const [studioSummary, setStudioSummary] = React.useState('');
  const [studioOwner, setStudioOwner] = React.useState('');
  const [studioEvidence, setStudioEvidence] = React.useState('');
  const [studioEffectiveDate, setStudioEffectiveDate] = React.useState('2026-09-01');
  const [studioStoreIds, setStudioStoreIds] = React.useState<string[]>([]);
  const [studioRoles, setStudioRoles] = React.useState<string[]>([]);
  const [studioSteps, setStudioSteps] = React.useState<Array<{ title: string; guidance: string; required: boolean }>>([{ title: '', guidance: '', required: true }]);
  const noticeScope = `${userId ?? profile.userId}:${isDemoMode ? profile.store?.id ?? 'all-stores' : status?.store?.id ?? 'current-store'}`;
  const noticeStorageKey = `ausease:effective-standard-notices:${noticeScope}`;
  React.useEffect(() => {
    let active = true;
    setDismissedStandardKeys({});
    void AsyncStorage.getItem(noticeStorageKey).then((stored) => {
      if (!active || !stored) return;
      try {
        const keys = JSON.parse(stored) as unknown;
        if (Array.isArray(keys)) {
          setDismissedStandardKeys(Object.fromEntries(keys.filter((key): key is string => typeof key === 'string').map((key) => [key, true])));
        }
      } catch {
        // An unreadable local preference should not prevent a new standard from being shown.
      }
    });
    return () => { active = false; };
  }, [noticeStorageKey]);
  const dismissStandardNotice = React.useCallback(async (checklist: DemoChecklist) => {
    const key = `${checklist.templateId ?? checklist.id}:v${checklist.version}:${checklist.assignedRoles.join(',')}`;
    const next = { ...dismissedStandardKeys, [key]: true as const };
    setDismissedStandardKeys(next);
    await AsyncStorage.setItem(noticeStorageKey, JSON.stringify(Object.keys(next)));
  }, [dismissedStandardKeys, noticeStorageKey]);
  const standardNotices = checklists.filter((checklist) => {
    const key = `${checklist.templateId ?? checklist.id}:v${checklist.version}:${checklist.assignedRoles.join(',')}`;
    const effectiveAt = Date.parse(checklist.effectiveDate);
    const hasTakenEffect = Number.isNaN(effectiveAt) || effectiveAt <= Date.now();
    const assignedToCurrentDemoProfile = !isDemoMode ||
      (checklist.assignedStores.includes(profile.store?.id ?? '') && checklist.assignedRoles.includes(profile.role));
    return hasTakenEffect && assignedToCurrentDemoProfile && !dismissedStandardKeys[key];
  });
  const togglePublishedChecklistItem = React.useCallback(async (checklist: DemoChecklist, itemId: string, done: boolean) => {
    if (isDemoMode) {
      toggleChecklistItem(checklist.id, itemId);
      return;
    }
    if (locked || !checklist.versionId) return;
    const overrideKey = `${checklist.versionId}:${itemId}`;
    setSavingChecklistItem(overrideKey);
    setLiveChecklistOverrides((current) => ({ ...current, [overrideKey]: !done }));
    try {
      await updateChecklistProgressAsync({
        checklistId: checklist.id,
        data: { versionId: checklist.versionId, itemId, completed: !done },
      });
      await publishedChecklistsQuery.refetch();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The checklist step could not be saved.';
      Alert.alert('Progress not saved', message);
    } finally {
      setLiveChecklistOverrides((current) => {
        const next = { ...current };
        delete next[overrideKey];
        return next;
      });
      setSavingChecklistItem(null);
    }
  }, [isDemoMode, locked, publishedChecklistsQuery, toggleChecklistItem, updateChecklistProgressAsync]);
  const openStudio = (template?: typeof demoData.checklistTemplates[number]) => {
    setStudioTemplateId(template?.templateId);
    setStudioName(template?.name ?? '');
    setStudioSummary(template?.summary ?? '');
    setStudioOwner(template?.owner ?? profile.displayName);
    setStudioEvidence(template?.evidenceLabel ?? '');
    setStudioEffectiveDate(template?.effectiveDate ?? '2026-09-01');
    setStudioStoreIds(template?.assignedStores ?? demoData.provisioning.stores.map((store) => store.id));
    setStudioRoles(template?.assignedRoles ?? ['employee', 'manager']);
    setStudioSteps(template?.items.map(({ title, guidance, required }) => ({ title, guidance, required })) ?? [{ title: '', guidance: '', required: true }]);
    setStudioVisible(true);
  };
  const toggleStudioValue = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const saveStudioDraft = () => {
    if (!isDemoMode || isReadOnly) return;
    if (!studioName.trim() || !studioSummary.trim() || !studioOwner.trim() || !studioEvidence.trim() ||
      !studioEffectiveDate.trim() || studioStoreIds.length === 0 || studioRoles.length === 0 ||
      studioSteps.some((step) => !step.title.trim() || !step.guidance.trim())) {
      Alert.alert('Checklist needs more detail', 'Add the checklist details, at least one step, an evidence rule, an owner, a date, and an audience.');
      return;
    }
    const id = createChecklistDraft({
      templateId: studioTemplateId,
      name: studioName.trim(),
      summary: studioSummary.trim(),
      owner: studioOwner.trim(),
      evidenceLabel: studioEvidence.trim(),
      effectiveDate: studioEffectiveDate.trim(),
      assignedStores: studioStoreIds,
      assignedRoles: studioRoles,
      items: studioSteps.map((step) => ({ ...step, title: step.title.trim(), guidance: step.guidance.trim() })),
    });
    setStudioVisible(false);
    Alert.alert('Draft saved', 'Review the audience and publish it from Checklist studio when it is ready.');
  };
  const publishStudioDraft = (checklistId: string) => {
    publishChecklist(checklistId);
    Alert.alert('Checklist published', 'The new version is now effective for the selected stores and roles. Existing completed work is unchanged.');
  };
  const captureAndComplete = async (routineId: string) => {
    if (isDemoMode) {
      Alert.alert('Preview only', isReadOnly ? 'Viewer profiles can browse tasks but cannot add evidence or change work.' : 'Camera evidence is disabled in the demo workspace.');
      return;
    }
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        if (permissionResult.canAskAgain === false && Platform.OS !== 'web') {
          Alert.alert('Camera permission needed', 'Open Settings and allow Ausease to attach evidence photos.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void Linking.openSettings().catch(() => undefined); } },
          ]);
        } else {
          Alert.alert('Evidence photo needed', 'Allow camera access to attach evidence before completing this routine.');
        }
        return;
      }
      const photo = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (photo.canceled) return;
      const asset = photo.assets[0];
      if (!evidenceQueueKey) {
        Alert.alert('Workspace not ready', 'Your store workspace is still loading. Try the photo again in a moment.');
        return;
      }
      let evidenceId: string | undefined;
      try {
        const evidence = await uploadEvidence(routineId, asset);
        evidenceId = evidence.id;
        await completeRoutineAsync({ routineId, data: { evidenceCount: 1, evidenceIds: [evidence.id] } });
      } catch (cause) {
        let durableUri = asset.uri;
        if (FileSystem.documentDirectory) {
          const candidate = `${FileSystem.documentDirectory}routine-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          try {
            await FileSystem.copyAsync({ from: asset.uri, to: candidate });
            durableUri = candidate;
          } catch {
            // Keep the captured URI as a last resort. The queue will remove it
            // with a clear message if the native camera has already reclaimed it.
          }
        }
        await queuePendingRoutineEvidence(AsyncStorage, { routineId, uri: durableUri, evidenceId, fileName: asset.fileName ?? undefined, mimeType: asset.mimeType ?? undefined, fileSize: asset.fileSize ?? undefined }, evidenceQueueKey);
        Alert.alert('Saved for sync', 'The photo is safely queued on this device and will upload when the connection returns.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetTodayRoutinesQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetOperationsCommandCenterQueryKey() });
    } catch (cause) {
      Alert.alert('Routine not completed', cause instanceof Error ? cause.message : 'Add an evidence photo and try again.');
    }
  };

  return (
    <Screen scroll>
      <Header eyebrow="Tuesday · 25 August" title="My tasks" action="search" />
      <View style={styles.editorialKicker}><Text style={[styles.kickerText, { color: colors.primary }]}>02 / FLOOR ROUTINE</Text><BrandRule color={colors.accent} /></View>
      {isDemoMode && <View testID="tasks-demo-context" style={[styles.demoNotice, { backgroundColor: colors.secondary }]}><Feather name={isReadOnly ? 'eye' : 'layers'} size={15} color={colors.secondaryForeground} /><Text style={[styles.demoNoticeText, { color: colors.secondaryForeground }]}>{isReadOnly ? `Read-only viewer · ${profile.store?.name ?? 'All stores'} · task changes are unavailable` : `Preview data · ${profile.store?.name ?? 'All stores'} store context`}</Text></View>}
      <View style={[styles.progressCard, { backgroundColor: colors.accent }]}>
         <NonInteractiveView style={[styles.progressOrbit, { borderColor: `${colors.foreground}28` }]} />
        <View><Text style={[styles.progressLabel, { color: colors.accentForeground }]}>SHIFT PROGRESS</Text><Text style={[styles.progressValue, { color: colors.foreground }]}>{done} of {tasks.length} complete</Text></View>
        <View style={styles.progressCircle}><Text style={[styles.progressPercent, { color: colors.accentForeground }]}>{tasks.length ? Math.round((done / tasks.length) * 100) : 0}%</Text></View>
        <View style={[styles.progressTrack, { backgroundColor: `${colors.foreground}20` }]}><View style={[styles.progressFill, { backgroundColor: colors.foreground, width: `${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%` }]} /></View>
      </View>

      {standardNotices.length > 0 && <View testID="effective-standard-notices" style={styles.standardNotices}>
        {standardNotices.map((checklist) => {
          const noticeKey = `${checklist.templateId ?? checklist.id}:v${checklist.version}:${checklist.assignedRoles.join(',')}`;
          return (
            <View key={noticeKey} testID={`effective-standard-notice-${checklist.templateId ?? checklist.id}`} style={[styles.standardNotice, { backgroundColor: colors.card, borderColor: colors.primary }]}>
              <View style={[styles.standardNoticeIcon, { backgroundColor: colors.accent }]}><Feather name="bell" size={16} color={colors.accentForeground} /></View>
              <View style={styles.standardNoticeCopy}>
                <Text style={[styles.standardNoticeEyebrow, { color: colors.primary }]}>NEW OPERATING STANDARD</Text>
                <Text style={[styles.standardNoticeTitle, { color: colors.foreground }]}>{checklist.name} · v{checklist.version}</Text>
                <Text style={[styles.standardNoticeMeta, { color: colors.mutedForeground }]}>Effective {checklist.effectiveDate} · Owner: {checklist.owner}</Text>
              </View>
              <Pressable testID={`dismiss-standard-${checklist.templateId ?? checklist.id}`} accessibilityRole="button" accessibilityLabel={`Dismiss ${checklist.name} notification`} onPress={() => { void dismissStandardNotice(checklist); }} style={styles.standardNoticeDismiss}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          );
        })}
      </View>}

      <View style={[styles.locationCard, { backgroundColor: colors.card, borderColor: locked ? colors.border : colors.primary }]}>
        <View style={[styles.locationIcon, { backgroundColor: locked ? colors.secondary : colors.accent }]}>
          <Feather name={locked ? 'lock' : 'map-pin'} size={18} color={locked ? colors.mutedForeground : colors.primary} />
        </View>
        <View style={styles.locationCopy}>
          <Text style={[styles.locationTitle, { color: colors.foreground }]}>{geofencePaused ? 'Location verification paused' : locked ? title : 'Store presence verified'}</Text>
          <Text style={[styles.locationSub, { color: colors.mutedForeground }]}>
            {geofencePaused ? `${status?.store?.name ?? 'Your store'} · location verification paused` : locked ? subtitle : `${status?.store?.name ?? 'Your store'} · both required team members are present`}
          </Text>
           {permissionBlocked && <Text testID="location-permission-guidance" style={[styles.errorText, { color: colors.destructive }]}>{permission.canAskAgain === false ? 'Location access is off. Open Settings to allow check-in.' : 'Allow location access to check in at your store.'}</Text>}
           {error && <Text style={[styles.errorText, { color: colors.destructive }]}>{permissionBlocked ? 'Location permission is off. Enable it to check in.' : error}</Text>}
        </View>
        <Pressable
          testID="store-check-in"
          accessibilityRole="button"
          accessibilityLabel={locked ? 'Check in at store' : 'Refresh store presence'}
          accessibilityState={{ busy: checkingIn || loading, disabled: checkingIn || loading || (isDemoMode && isReadOnly) }}
          onPress={locked ? checkIn : refresh}
          disabled={checkingIn || loading || (isDemoMode && isReadOnly)}
          style={({ pressed }) => [styles.checkInButton, { backgroundColor: colors.primary, opacity: pressed || checkingIn || loading || (isDemoMode && isReadOnly) ? .65 : 1 }]}
        >
          <Text style={styles.checkInText}>{checkingIn ? 'Checking…' : locked ? 'Check in' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {isDemoMode && profile.demoKey === 'hq_admin' && !isReadOnly && <View testID="checklist-studio" style={[styles.studioCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.studioHeader}>
          <View style={[styles.checklistIcon, { backgroundColor: colors.accent }]}><Feather name="edit-3" size={16} color={colors.accentForeground} /></View>
          <View style={styles.taskCopy}>
            <Text style={[styles.studioTitle, { color: colors.foreground }]}>Checklist studio</Text>
            <Text style={[styles.studioHint, { color: colors.mutedForeground }]}>Create a versioned standard and publish it to selected stores.</Text>
          </View>
          <Pressable testID="new-checklist" onPress={() => openStudio()} style={[styles.studioButton, { backgroundColor: colors.primary }]}><Text style={styles.checkInText}>New</Text></Pressable>
        </View>
        {demoData.checklistTemplates.map((template) => <View key={template.id} style={[styles.studioRow, { borderTopColor: colors.border }]}>
          <View style={styles.taskCopy}>
            <Text style={[styles.taskTitle, { color: colors.foreground }]}>{template.name}</Text>
            <Text style={[styles.taskMeta, { color: colors.mutedForeground }]}>v{template.version} · {template.status === 'published' ? `Effective ${template.effectiveDate}` : 'Draft'} · {template.owner}</Text>
          </View>
          {template.status === 'draft'
            ? <Pressable testID={`publish-checklist-${template.id}`} onPress={() => publishStudioDraft(template.id)} style={[styles.studioButton, { backgroundColor: colors.accent }]}><Text style={[styles.checkInText, { color: colors.accentForeground }]}>Publish</Text></Pressable>
            : <Pressable testID={`new-version-${template.templateId}`} onPress={() => openStudio(template)} style={[styles.outlineButton, { borderColor: colors.input }]}><Text style={[styles.outlineButtonText, { color: colors.foreground }]}>New version</Text></Pressable>}
        </View>)}
      </View>}

      <View style={styles.presenceRow}>
        <View style={[styles.presenceBadge, { backgroundColor: status?.userPresent ? colors.accent : colors.secondary }]}><Feather name={status?.userPresent ? 'check' : 'user'} size={12} color={status?.userPresent ? colors.primary : colors.mutedForeground} /><Text style={[styles.presenceText, { color: colors.mutedForeground }]}>You {status?.userPresent ? 'present' : 'not checked in'}</Text></View>
        <View style={[styles.presenceBadge, { backgroundColor: status?.managerPresent ? colors.accent : colors.secondary }]}><Feather name={status?.managerPresent ? 'check' : 'user-check'} size={12} color={status?.managerPresent ? colors.primary : colors.mutedForeground} /><Text style={[styles.presenceText, { color: colors.mutedForeground }]}>Manager {status?.managerPresent ? 'present' : 'not checked in'}</Text></View>
      </View>

      <View style={styles.routineHeader}><Text style={[styles.routineTitle, { color: colors.foreground }]}>Today’s routines</Text><Text style={[styles.routineHint, { color: colors.mutedForeground }]}>Evidence keeps every close accountable</Text></View>
      {routines.map((routine) => (
        <View key={routine.id} style={[styles.routineRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: locked ? .55 : 1 }]}>
          <View style={[styles.routineIcon, { backgroundColor: routine.status === 'completed' ? colors.accent : routine.status === 'overdue' ? colors.secondary : colors.primary + '18' }]}>
            <Feather name={routine.status === 'completed' ? 'check' : routine.status === 'overdue' ? 'alert-circle' : 'sun'} size={16} color={routine.status === 'overdue' ? colors.destructive : colors.primary} />
          </View>
          <View style={styles.taskCopy}><Text style={[styles.taskTitle, { color: colors.foreground }]}>{routine.name}</Text><Text style={[styles.taskMeta, { color: colors.mutedForeground }]}>{routine.status === 'completed' ? 'Completed' : routine.status === 'overdue' ? `Overdue · due ${routine.dueTime}` : `Due ${routine.dueTime}`} · {routine.evidenceRequired ? 'Photo required' : 'No evidence required'}</Text></View>
           {routine.status !== 'completed' && <Pressable testID={`routine-evidence-${routine.routineId}`} accessibilityRole="button" accessibilityLabel={`Add evidence photo for ${routine.name}`} accessibilityState={{ disabled: locked || completeRoutinePending }} disabled={locked || completeRoutinePending} onPress={() => captureAndComplete(routine.routineId)} style={[styles.routineButton, { backgroundColor: colors.primary, opacity: locked || completeRoutinePending ? .5 : 1 }]}><Text style={styles.checkInText}>Add photo</Text></Pressable>}
        </View>
      ))}

      {checklists.length > 0 && <View testID={isDemoMode ? 'demo-checklists' : 'published-checklists'} style={styles.checklistSection}>
        <View style={styles.routineHeader}><Text style={[styles.routineTitle, { color: colors.foreground }]}>Written checklists</Text><Text style={[styles.routineHint, { color: colors.mutedForeground }]}>Tap a checklist to review the standard</Text></View>
        {checklists.map((checklist) => {
          const expanded = expandedChecklistId === checklist.id;
          const renderedItems = checklist.items.map((item) => {
            const overrideKey = checklist.versionId ? `${checklist.versionId}:${item.id}` : '';
            return { ...item, done: overrideKey in liveChecklistOverrides ? liveChecklistOverrides[overrideKey] : item.done, overrideKey };
          });
          const completedItems = renderedItems.filter((item) => item.done).length;
          return (
            <View key={checklist.id} testID={`demo-checklist-${checklist.id}`} style={[styles.checklistCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable testID={`expand-${checklist.id}`} onPress={() => setExpandedChecklistId(expanded ? null : checklist.id)} style={styles.checklistHeader}>
                <View style={[styles.checklistIcon, { backgroundColor: completedItems === checklist.items.length ? colors.accent : colors.secondary }]}>
                  <Feather name={completedItems === checklist.items.length ? 'check-circle' : 'clipboard'} size={17} color={completedItems === checklist.items.length ? colors.accentForeground : colors.primary} />
                </View>
                <View style={styles.taskCopy}>
                  <Text style={[styles.taskTitle, { color: colors.foreground }]}>{checklist.name}</Text>
                  <Text style={[styles.taskMeta, { color: colors.mutedForeground }]}>{completedItems}/{checklist.items.length} checks complete · Owner: {checklist.owner}</Text>
                </View>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
              </Pressable>
              {expanded && <View testID={`checklist-details-${checklist.id}`} style={[styles.checklistDetails, { borderTopColor: colors.border }]}>
                <Text style={[styles.checklistSummary, { color: colors.mutedForeground }]}>{checklist.summary}</Text>
                <View style={[styles.evidenceNote, { backgroundColor: colors.secondary }]}>
                  <Feather name="camera" size={13} color={colors.secondaryForeground} />
                  <Text style={[styles.evidenceText, { color: colors.secondaryForeground }]}>{checklist.evidenceLabel}</Text>
                </View>
                {renderedItems.map((item) => (
                  <Pressable
                    key={item.id}
                    testID={`checklist-item-${item.id}`}
                    onPress={() => { void togglePublishedChecklistItem(checklist, item.id, item.done); }}
                    disabled={isReadOnly || locked || savingChecklistItem === item.overrideKey}
                    accessibilityState={{ disabled: isReadOnly || locked || savingChecklistItem === item.overrideKey, checked: item.done }}
                    style={({ pressed }) => [styles.checklistItem, { opacity: isReadOnly || locked || savingChecklistItem === item.overrideKey || pressed ? .65 : 1 }]}
                  >
                    <View style={[styles.checklistCheckbox, { borderColor: item.done ? colors.primary : colors.input, backgroundColor: item.done ? colors.primary : 'transparent' }]}>
                      {item.done && <Feather name="check" size={12} color={colors.primaryForeground} />}
                    </View>
                    <View style={styles.taskCopy}>
                      <Text style={[styles.checklistItemTitle, { color: colors.foreground }, item.done && styles.done]}>{item.title}{item.required ? ' · required' : ''}</Text>
                      <Text style={[styles.checklistGuidance, { color: colors.mutedForeground }]}>{item.guidance}</Text>
                    </View>
                  </Pressable>
                ))}
                {(isReadOnly || !isDemoMode) && <Text style={[styles.checklistReadOnly, { color: colors.mutedForeground }]}>{isReadOnly ? 'Viewer mode · checklist updates are unavailable' : `Published v${checklist.version} · effective ${checklist.effectiveDate}`}</Text>}
              </View>}
            </View>
          );
        })}
      </View>}

      <Modal visible={studioVisible} animationType="slide" transparent onRequestClose={() => setStudioVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: `${colors.foreground}88` }]}>
          <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.studioModal, { backgroundColor: colors.card }]} bottomOffset={24}>
            <View style={styles.modalHeader}><View><Text style={[styles.studioTitle, { color: colors.foreground }]}>{studioTemplateId ? 'Create checklist version' : 'Create checklist'}</Text><Text style={[styles.studioHint, { color: colors.mutedForeground }]}>Published versions stay attached to completed history.</Text></View><Pressable onPress={() => setStudioVisible(false)}><Feather name="x" size={22} color={colors.foreground} /></Pressable></View>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>STANDARD</Text>
            <TextInput testID="checklist-name" value={studioName} onChangeText={setStudioName} placeholder="e.g. Holiday opening standard" placeholderTextColor={colors.mutedForeground} style={[styles.adminInput, { color: colors.foreground, borderColor: colors.input }]} />
            <TextInput testID="checklist-summary" value={studioSummary} onChangeText={setStudioSummary} placeholder="What should this standard achieve?" placeholderTextColor={colors.mutedForeground} style={[styles.adminInput, styles.multilineInput, { color: colors.foreground, borderColor: colors.input }]} multiline />
            <TextInput testID="checklist-owner" value={studioOwner} onChangeText={setStudioOwner} placeholder="Owner" placeholderTextColor={colors.mutedForeground} style={[styles.adminInput, { color: colors.foreground, borderColor: colors.input }]} />
            <TextInput testID="checklist-evidence" value={studioEvidence} onChangeText={setStudioEvidence} placeholder="Evidence rule, e.g. one wide floor photo" placeholderTextColor={colors.mutedForeground} style={[styles.adminInput, { color: colors.foreground, borderColor: colors.input }]} />
            <TextInput testID="checklist-effective-date" value={studioEffectiveDate} onChangeText={setStudioEffectiveDate} placeholder="Effective date YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} style={[styles.adminInput, { color: colors.foreground, borderColor: colors.input }]} />
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>PUBLISH TO STORES</Text>
            {demoData.provisioning.stores.map((store) => <Pressable key={store.id} testID={`checklist-store-${store.id}`} onPress={() => setStudioStoreIds(toggleStudioValue(studioStoreIds, store.id))} style={styles.choiceRow}><View style={[styles.choiceBox, { borderColor: studioStoreIds.includes(store.id) ? colors.primary : colors.input, backgroundColor: studioStoreIds.includes(store.id) ? colors.primary : 'transparent' }]}>{studioStoreIds.includes(store.id) && <Feather name="check" size={11} color={colors.primaryForeground} />}</View><Text style={[styles.choiceText, { color: colors.foreground }]}>{store.name}</Text></Pressable>)}
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>ROLES</Text>
            {['employee', 'manager', 'reviewer'].map((role) => <Pressable key={role} testID={`checklist-role-${role}`} onPress={() => setStudioRoles(toggleStudioValue(studioRoles, role))} style={styles.choiceRow}><View style={[styles.choiceBox, { borderColor: studioRoles.includes(role) ? colors.primary : colors.input, backgroundColor: studioRoles.includes(role) ? colors.primary : 'transparent' }]}>{studioRoles.includes(role) && <Feather name="check" size={11} color={colors.primaryForeground} />}</View><Text style={[styles.choiceText, { color: colors.foreground }]}>{role === 'employee' ? 'Store team members' : role === 'manager' ? 'Store managers' : 'Regional reviewers'}</Text></Pressable>)}
            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>REQUIRED STEPS AND GUIDANCE</Text>
            {studioSteps.map((step, index) => <View key={index} style={[styles.stepEditor, { borderColor: colors.border }]}>
              <Text style={[styles.stepNumber, { color: colors.primary }]}>STEP {index + 1}</Text>
              <TextInput testID={`checklist-step-title-${index}`} value={step.title} onChangeText={(title) => setStudioSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title } : item))} placeholder="Step title" placeholderTextColor={colors.mutedForeground} style={[styles.adminInput, { color: colors.foreground, borderColor: colors.input }]} />
              <TextInput testID={`checklist-step-guidance-${index}`} value={step.guidance} onChangeText={(guidance) => setStudioSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, guidance } : item))} placeholder="Guidance for the frontline team" placeholderTextColor={colors.mutedForeground} style={[styles.adminInput, styles.multilineInput, { color: colors.foreground, borderColor: colors.input }]} multiline />
              <Pressable testID={`checklist-step-required-${index}`} onPress={() => setStudioSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, required: !item.required } : item))} style={styles.choiceRow}><View style={[styles.choiceBox, { borderColor: step.required ? colors.primary : colors.input, backgroundColor: step.required ? colors.primary : 'transparent' }]}>{step.required && <Feather name="check" size={11} color={colors.primaryForeground} />}</View><Text style={[styles.choiceText, { color: colors.foreground }]}>Required step</Text></Pressable>
            </View>)}
            <Pressable testID="add-checklist-step" onPress={() => setStudioSteps((current) => [...current, { title: '', guidance: '', required: true }])} style={[styles.outlineButton, { borderColor: colors.input }]}><Text style={[styles.outlineButtonText, { color: colors.foreground }]}>+ Add another step</Text></Pressable>
            <Pressable testID="save-checklist-draft" onPress={saveStudioDraft} style={[styles.adminButton, { backgroundColor: colors.primary }]}><Text style={styles.adminButtonText}>Save draft</Text></Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <View style={styles.filterRow}><Pill label="All tasks" tone="success" /><Text style={[styles.filter, { color: colors.mutedForeground }]}>Opening · {tasks.filter((t) => !t.done).length} remaining</Text></View>
      {tasks.map((task) => (
        <Pressable
          testID={`task-${task.id}`}
          key={task.id}
          onPress={() => toggleTask(task.id)}
          disabled={locked}
          accessibilityState={{ disabled: locked }}
          style={({ pressed }) => [styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: locked ? .55 : pressed ? .65 : 1 }]}
        >
          <View style={[styles.checkbox, { borderColor: task.done ? colors.primary : colors.input, backgroundColor: task.done ? colors.primary : 'transparent' }]}>{task.done && <Feather name="check" size={15} color="#fff" />}</View>
          <View style={styles.taskCopy}><Text style={[styles.taskTitle, { color: task.done ? colors.mutedForeground : colors.foreground }, task.done && styles.done]}>{task.title}</Text><Text style={[styles.taskMeta, { color: colors.mutedForeground }]}>{task.area} · {task.due}</Text></View>
          {task.priority === 'high' && <Pill label="Priority" tone="warning" />}
          {locked && <Feather name="lock" size={14} color={colors.mutedForeground} />}
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  editorialKicker: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  kickerText: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 1 },
  demoNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 11, borderRadius: 12, marginBottom: 12 }, demoNoticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11 },
  progressCard: { borderRadius: 20, padding: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, overflow: 'hidden' },
  progressOrbit: { position: 'absolute', right: -35, bottom: -30, width: 140, height: 82, borderWidth: 1, borderRadius: 80, transform: [{ rotate: '-12deg' }] },
  progressLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1, marginBottom: 8 },
  progressValue: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  progressCircle: { width: 57, height: 57, borderRadius: 29, borderWidth: 5, borderColor: '#ffffffb5', alignItems: 'center', justifyContent: 'center' },
  progressPercent: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  progressTrack: { position: 'absolute', left: 19, right: 19, bottom: 9, height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  standardNotices: { marginBottom: 12, gap: 8 },
  standardNotice: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  standardNoticeIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  standardNoticeCopy: { flex: 1 },
  standardNoticeEyebrow: { fontFamily: 'SpaceMono_700Bold', fontSize: 8, letterSpacing: .8, marginBottom: 4 },
  standardNoticeTitle: { fontFamily: 'Inter_700Bold', fontSize: 12, lineHeight: 16 },
  standardNoticeMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3 },
  standardNoticeDismiss: { padding: 4 },
  locationCard: { borderRadius: 17, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  locationIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  locationCopy: { flex: 1 },
  locationTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  locationSub: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, marginTop: 3 },
  errorText: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 14, marginTop: 4 },
  checkInButton: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  checkInText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 10 },
  presenceRow: { flexDirection: 'row', gap: 7, marginBottom: 16 },
  presenceBadge: { flex: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  presenceText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  routineHeader: { marginTop: 4, marginBottom: 10 },
  routineTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  routineHint: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  routineRow: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  routineIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  routineButton: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 },
  checklistSection: { marginTop: 12 },
  adminInput: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 9 },
  adminButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  adminButtonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
  studioCard: { borderRadius: 16, borderWidth: 1, padding: 13, marginTop: 12, marginBottom: 4 },
  studioHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  studioTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  studioHint: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, marginTop: 3 },
  studioButton: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  outlineButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  outlineButtonText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  studioRow: { minHeight: 54, borderTopWidth: 1, marginTop: 11, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  studioModal: { padding: 20, paddingBottom: 34, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginBottom: 12 },
  label: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 9 },
  multilineInput: { minHeight: 68, height: undefined, paddingTop: 12, textAlignVertical: 'top' },
  choiceRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 9 },
  choiceBox: { width: 19, height: 19, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  stepEditor: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
  stepNumber: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 1 },
  checklistCard: { borderRadius: 16, borderWidth: 1, marginBottom: 9, overflow: 'hidden' },
  checklistHeader: { minHeight: 70, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checklistIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checklistDetails: { borderTopWidth: 1, padding: 13 },
  checklistSummary: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginBottom: 10 },
  evidenceNote: { borderRadius: 10, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  evidenceText: { fontFamily: 'Inter_500Medium', fontSize: 10, flex: 1 },
  checklistItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 10 },
  checklistCheckbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checklistItemTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 16 },
  checklistGuidance: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 2 },
  checklistReadOnly: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  filter: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  taskRow: { borderRadius: 17, borderWidth: 1, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  checkbox: { width: 25, height: 25, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  taskCopy: { flex: 1 },
  taskTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 18 },
  done: { textDecorationLine: 'line-through' },
  taskMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
});