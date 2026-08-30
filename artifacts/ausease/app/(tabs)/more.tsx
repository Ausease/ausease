import React from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BrandRule } from '@/components/BrandDecor';
import { useGetEnterpriseAudit, useGetEnterpriseProfile, useGetEnterpriseProvisioning, useAddEnterpriseDomain, useAddEnterpriseStore, useInviteEnterpriseMember, useUpdateEnterpriseMembership } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { Header, Screen } from '@/components/Screen';
import { useDemo } from '@/context/DemoContext';

const roleLabels: Record<string, string> = {
  employee: 'Store team member',
  manager: 'Store manager',
  reviewer: 'Reviewer',
  hq_admin: 'Headquarters admin',
};

export default function MoreScreen() {
  const colors = useColors();
  const { demoEligible, isDemoMode, isReadOnly, profile: demoProfile, profileOptions, data: demoData, verifyDemoAccess, switchProfile, exitDemo, updateProfile } = useDemo();
  const profileQuery = useGetEnterpriseProfile({ query: { queryKey: ['enterprise-profile'], enabled: !isDemoMode, retry: false } });
  const profile = isDemoMode ? demoProfile : profileQuery.data;
  const canReviewAudit = profile?.role === 'manager' || profile?.role === 'reviewer' || profile?.role === 'hq_admin';
  const auditQuery = useGetEnterpriseAudit({ query: { queryKey: ['enterprise-audit'], enabled: !isDemoMode && canReviewAudit, retry: false } });
  const role = profile?.role ?? 'employee';
  const storeName = profile?.store?.name ?? 'Pitt Street Store';
  const organizationName = profile?.organization?.name ?? 'ausease workspace';
  const queryClient = useQueryClient();
  const provisioningQuery = useGetEnterpriseProvisioning({ query: { queryKey: ['/api/admin/provisioning'], enabled: !isDemoMode && profile?.role === 'hq_admin', retry: false } });
  const auditEvents = isDemoMode ? demoData.audit.events : auditQuery.data?.events ?? [];
  const provisioning = isDemoMode ? demoData.provisioning : provisioningQuery.data;
  const addDomain = useAddEnterpriseDomain();
  const addStore = useAddEnterpriseStore();
  const inviteMember = useInviteEnterpriseMember();
  const updateMember = useUpdateEnterpriseMembership();
  const [domain, setDomain] = React.useState('');
  const [providerName, setProviderName] = React.useState('');
  const [providerType, setProviderType] = React.useState<'saml' | 'oidc' | 'oauth'>('oidc');
  const [newStoreName, setNewStoreName] = React.useState('');
  const [memberEmail, setMemberEmail] = React.useState('');
  const [memberStoreId, setMemberStoreId] = React.useState('');
  const [memberRole, setMemberRole] = React.useState<'employee' | 'manager' | 'reviewer' | 'hq_admin'>('employee');
  const [demoModalVisible, setDemoModalVisible] = React.useState(false);
  const [profilePickerVisible, setProfilePickerVisible] = React.useState(false);
  const [demoCode, setDemoCode] = React.useState('');
  const [demoBusy, setDemoBusy] = React.useState(false);
  const [profileEditVisible, setProfileEditVisible] = React.useState(false);
  const [profileName, setProfileName] = React.useState('');
  const [profileInitials, setProfileInitials] = React.useState('');
  const [profileRole, setProfileRole] = React.useState('');
  const refreshProvisioning = () => { if (!isDemoMode) return queryClient.invalidateQueries({ queryKey: ['/api/admin/provisioning'] }); };
  const showMutationError = (error: unknown) => Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
  const handleDemoAccess = async () => {
    if (!demoCode.trim() || demoBusy) return;
    setDemoBusy(true);
    try {
      await verifyDemoAccess(demoCode);
      setDemoCode('');
      setDemoModalVisible(false);
    } catch (error) {
      Alert.alert('Demo access denied', error instanceof Error ? error.message : 'Check the code and try again.');
    } finally {
      setDemoBusy(false);
    }
  };
  const handleAddDomain = async () => {
    if (isDemoMode) return;
    if (!domain.trim() || !providerName.trim()) return;
    try { await addDomain.mutateAsync({ data: { domain: domain.trim(), providerName: providerName.trim(), providerType } }); setDomain(''); setProviderName(''); refreshProvisioning(); }
    catch (error) { showMutationError(error); }
  };
  const handleAddStore = async () => {
    if (isDemoMode) return;
    if (!newStoreName.trim()) return;
    try { await addStore.mutateAsync({ data: { name: newStoreName.trim() } }); setNewStoreName(''); refreshProvisioning(); }
    catch (error) { showMutationError(error); }
  };
  const handleInvite = async () => {
    if (isDemoMode) return;
    if (!memberEmail.trim() || !memberStoreId) return;
    try { await inviteMember.mutateAsync({ data: { email: memberEmail.trim(), storeId: memberStoreId, role: memberRole } }); setMemberEmail(''); refreshProvisioning(); }
    catch (error) { showMutationError(error); }
  };
  const inputStyle = [styles.adminInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }];
  const openProfileEditor = () => {
    if (!isDemoMode || isReadOnly) return;
    setProfileName(demoProfile.displayName);
    setProfileInitials(demoProfile.initials);
    setProfileRole(demoProfile.roleLabel);
    setProfileEditVisible(true);
  };
  const saveProfile = () => {
    const nextName = profileName.trim();
    const nextRole = profileRole.trim();
    const nextInitials = profileInitials.trim().toUpperCase();
    if (nextName.length < 2 || nextName.length > 60) {
      Alert.alert('Check your name', 'Enter a display name between 2 and 60 characters.');
      return;
    }
    if (!nextRole || nextRole.length > 60) {
      Alert.alert('Check your role label', 'Enter a role label between 1 and 60 characters.');
      return;
    }
    if (!/^[A-Z0-9]{1,4}$/.test(nextInitials)) {
      Alert.alert('Check your initials', 'Use 1 to 4 letters or numbers.');
      return;
    }
    updateProfile({ displayName: nextName, initials: nextInitials, roleLabel: nextRole });
    setProfileEditVisible(false);
  };

  return (
    <Screen scroll>
      <Header eyebrow="ausease" title="More" action="settings" />
      <View style={styles.editorialKicker}><Text style={[styles.kickerText, { color: colors.primary }]}>06 / CONTROL ROOM</Text><BrandRule color={colors.accent} /></View>
       <View testID="profile-summary" style={[styles.profile, { backgroundColor: colors.foreground }]}>
        <View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}><Text testID="selected-profile-initials" style={[styles.profileInitials, { color: colors.primaryForeground }]}>{isDemoMode ? demoProfile.initials : 'AC'}</Text></View>
         <View style={styles.profileCopy}>
           <Text testID="selected-profile-name" style={styles.profileName}>{isDemoMode ? demoProfile.displayName : 'Alex Carter'}</Text>
           <Text testID="selected-profile-context" style={styles.profileRole}>{isDemoMode ? demoProfile.roleLabel : roleLabels[role] ?? 'Store team member'} · {storeName}</Text>
          <Text style={[styles.profileWorkspace, { color: colors.accent }]}>{organizationName}</Text>
        </View>
         {isDemoMode ? <Pressable testID="edit-demo-profile" accessibilityLabel="Edit demo profile" disabled={isReadOnly} onPress={openProfileEditor} style={({ pressed }) => [styles.editProfileButton, { backgroundColor: colors.accent, opacity: isReadOnly || pressed ? .55 : 1 }]}><Feather name="edit-2" size={13} color={colors.accentForeground} /><Text style={[styles.editProfileText, { color: colors.accentForeground }]}>Edit</Text></Pressable> : <Feather name="chevron-right" size={18} color="#B9C4D0" />}
      </View>

      {isDemoMode && (
        <View testID="demo-access-notice" style={[styles.accessNotice, { backgroundColor: colors.secondary }]}>
          <Feather name={isReadOnly ? 'eye' : 'layers'} size={15} color={colors.secondaryForeground} />
          <Text style={[styles.accessText, { color: colors.secondaryForeground }]}>{isReadOnly ? 'Read-only viewer · changes are unavailable' : 'Preview profile · changes stay local to this demo workspace'}</Text>
        </View>
      )}
      {isDemoMode && (
        <View testID="demo-profile-switcher" style={[styles.demoBar, { backgroundColor: colors.foreground }]}>
          <View style={styles.demoBarCopy}>
            <View style={styles.demoLabelRow}>
              <View style={[styles.demoDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.demoLabel, { color: colors.accent }]}>DEMO PROFILE</Text>
            </View>
            <Text style={styles.demoProfile}>{demoProfile.displayName} · {demoProfile.roleLabel}</Text>
          </View>
          <Pressable testID="open-profile-picker" accessibilityLabel="Switch demo profile" onPress={() => setProfilePickerVisible(true)} style={[styles.demoSwitchButton, { backgroundColor: colors.accent }]}>
            <Text style={[styles.demoSwitchText, { color: colors.accentForeground }]}>Switch</Text>
            <Feather name="chevron-down" size={13} color={colors.accentForeground} />
          </Pressable>
        </View>
      )}
      {!isDemoMode && profileQuery.isError && (
        <View style={[styles.accessNotice, { backgroundColor: colors.secondary }]}>
          <Feather name="shield" size={15} color={colors.secondaryForeground} />
          <Text style={[styles.accessText, { color: colors.secondaryForeground }]}>Your account is not provisioned yet. Ask headquarters to invite you and assign a store.</Text>
        </View>
      )}
      {!isDemoMode && demoEligible && profile?.access === 'active' && (
        <View style={[styles.demoCard, { backgroundColor: colors.foreground }]}>
          <View style={styles.demoCardIcon}><Feather name="lock" size={17} color={colors.accent} /></View>
          <View style={styles.rowCopy}>
            <Text style={[styles.demoTitle, { color: colors.accent }]}>Private demo workspace</Text>
            <Text style={styles.demoSub}>For ausease team members · requires the team code</Text>
          </View>
          <Pressable testID="open-demo-access" onPress={() => setDemoModalVisible(true)} style={({ pressed }) => [styles.demoOpen, { backgroundColor: colors.accent, opacity: pressed ? .7 : 1 }]}>
            <Text style={[styles.demoOpenText, { color: colors.accentForeground }]}>Open</Text>
          </Pressable>
        </View>
      )}
      {profile?.access !== 'active' && !profileQuery.isError && (
        <View style={[styles.accessNotice, { backgroundColor: profile?.access === 'disabled' ? '#FCE4E0' : colors.secondary }]}>
          <Feather name={profile?.access === 'disabled' ? 'slash' : 'clock'} size={15} color={profile?.access === 'disabled' ? colors.destructive : colors.secondaryForeground} />
          <Text style={[styles.accessText, { color: profile?.access === 'disabled' ? colors.destructive : colors.secondaryForeground }]}>
            {profile?.access === 'disabled' ? 'Your store access is disabled. Contact your headquarters administrator.' : profile?.access === 'invitation_required' ? 'Your invitation is waiting for approval. Ask your administrator to activate it.' : 'Your account needs a store assignment. Ask your headquarters administrator for access.'}
          </Text>
        </View>
      )}

      <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>WORKSPACE</Text>
      {[
        ['users', 'Team directory', 'See who is working today'],
        ['bar-chart-2', 'Store performance', 'Daily and weekly reports'],
        ['book-open', 'Playbooks', 'Guides and operating standards'],
      ].map(([icon, title, sub]) => (
        <Pressable key={title} style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? .65 : 1 }]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name={icon as keyof typeof Feather.glyphMap} size={18} color={colors.foreground} /></View>
          <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text></View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>
      ))}

      {canReviewAudit && (
        <View testID="governance-section">
          <Text style={[styles.groupLabel, { color: colors.mutedForeground, marginTop: 25 }]}>GOVERNANCE</Text>
          <View style={[styles.auditCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.auditHeader}><View><Text style={[styles.rowTitle, { color: colors.foreground }]}>Audit history</Text><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Recent accountable store actions</Text></View><Feather name="activity" size={18} color={colors.primary} /></View>
             {auditEvents.slice(0, 3).map((event) => (
              <View key={event.id} style={[styles.auditRow, { borderTopColor: colors.border }]}>
                <View style={[styles.auditDot, { backgroundColor: colors.primary }]} />
                <View style={styles.rowCopy}><Text style={[styles.auditAction, { color: colors.foreground }]}>{event.action}</Text><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{event.resourceType} · {event.actorRole}</Text></View>
              </View>
            ))}
             {!auditQuery.isLoading && !auditEvents.length && <Text style={[styles.emptyAudit, { color: colors.mutedForeground }]}>No audited actions have been recorded yet.</Text>}
          </View>
        </View>
      )}

      {profile?.role === 'hq_admin' && (
        <View testID="headquarters-admin-section">
          <Text style={[styles.groupLabel, { color: colors.mutedForeground, marginTop: 25 }]}>HEADQUARTERS ADMIN</Text>
          <View style={[styles.adminCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.adminTitle, { color: colors.foreground }]}>Company domains & SSO</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Provider secrets stay on the server. This app only shows mapping status.</Text>
             {provisioning?.domains.map((item) => (
              <View key={item.id} style={[styles.adminListRow, { borderTopColor: colors.border }]}>
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.domain}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{item.providerName} · {item.providerType.toUpperCase()}</Text>
                  {item.credentialStatus === 'error' && <Text style={[styles.validationError, { color: colors.destructive }]}>{item.credentialValidationError ?? 'Provider credentials need attention.'}</Text>}
                </View>
                <View style={styles.statusCopy}>
                  <Text style={[styles.status, { color: item.enabled ? (item.credentialStatus === 'error' ? colors.destructive : colors.accentForeground) : colors.destructive }]}>
                    {!item.enabled ? 'Disabled' : item.credentialStatus === 'configured' ? 'Ready' : item.credentialStatus === 'error' ? 'Needs attention' : 'Setup required'}
                  </Text>
                  {item.credentialVersion > 0 && <Text style={[styles.version, { color: colors.mutedForeground }]}>v{item.credentialVersion}</Text>}
                </View>
              </View>
            ))}
             {!!provisioning?.domains.length && <Text style={[styles.setupHint, { color: colors.mutedForeground }]}>{isDemoMode ? 'Demo configuration is read-only and never reaches a live identity provider.' : 'Credentials are configured and rotated in the secure server-side headquarters flow. This mobile app never accepts or displays secret values.'}</Text>}
             <TextInput value={domain} onChangeText={setDomain} editable={!isDemoMode} autoCapitalize="none" placeholder="company.com" placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { opacity: isDemoMode ? .6 : 1 }]} />
             <TextInput value={providerName} onChangeText={setProviderName} editable={!isDemoMode} placeholder="Provider name" placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { opacity: isDemoMode ? .6 : 1 }]} />
             <Pressable disabled={isDemoMode} onPress={() => setProviderType(providerType === 'oidc' ? 'saml' : providerType === 'saml' ? 'oauth' : 'oidc')} style={[styles.typeToggle, { borderColor: colors.border, opacity: isDemoMode ? .6 : 1 }]}><Text style={[styles.typeText, { color: colors.foreground }]}>Type: {providerType.toUpperCase()} · tap to change</Text></Pressable>
             <Pressable testID="add-domain" onPress={handleAddDomain} disabled={isDemoMode || addDomain.isPending} style={[styles.adminButton, { backgroundColor: colors.primary, opacity: isDemoMode || addDomain.isPending ? .5 : 1 }]}><Text style={styles.adminButtonText}>{isDemoMode ? 'Demo configuration is read-only' : 'Add domain mapping'}</Text></Pressable>
          </View>
          <View style={[styles.adminCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.adminTitle, { color: colors.foreground }]}>Stores</Text>
             {provisioning?.stores.map((store) => (
              <Pressable
                key={store.id}
                accessibilityRole="button"
                accessibilityLabel={`Open settings for ${store.name}`}
                onPress={() => router.push({ pathname: '/store-settings' as never, params: { storeId: store.id } } as never)}
                style={({ pressed }) => [styles.adminListRow, { borderTopColor: colors.border, opacity: pressed ? .65 : 1 }]}
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{store.name}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                    {store.latitude !== null && store.latitude !== undefined && store.longitude !== null && store.longitude !== undefined
                      ? `${store.geofenceEnabled === false ? 'Paused · ' : ''}${store.latitude.toFixed(5)}, ${store.longitude.toFixed(5)} · ${store.geofenceRadiusMeters ?? 150} m`
                      : store.geofenceEnabled === false ? 'Paused · location not configured' : 'Geofence not configured'}
                  </Text>
                </View>
                <Feather name="settings" size={16} color={colors.primary} />
              </Pressable>
            ))}
             <TextInput value={newStoreName} onChangeText={setNewStoreName} editable={!isDemoMode} placeholder="New store name" placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { opacity: isDemoMode ? .6 : 1 }]} />
             <Pressable testID="add-store" onPress={handleAddStore} disabled={isDemoMode || addStore.isPending} style={[styles.adminButton, { backgroundColor: colors.primary, opacity: isDemoMode || addStore.isPending ? .5 : 1 }]}><Text style={styles.adminButtonText}>{isDemoMode ? 'Demo stores are read-only' : 'Add store'}</Text></Pressable>
          </View>
          <View style={[styles.adminCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.adminTitle, { color: colors.foreground }]}>Invite and manage access</Text>
             {provisioning?.memberships.map((member) => (
              <View key={member.id} style={[styles.adminListRow, { borderTopColor: colors.border }]}>
                <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{member.email ?? member.clerkUserId}</Text><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{member.role} · {member.status}</Text></View>
                <View style={styles.memberActions}>
                   <Pressable disabled={isDemoMode} accessibilityLabel={`Change role for ${member.email ?? 'member'}`} onPress={() => {
                     if (isDemoMode) return;
                    const roles = ['employee', 'manager', 'reviewer', 'hq_admin'] as const;
                    const next = roles[(roles.indexOf(member.role as typeof roles[number]) + 1) % roles.length];
                    updateMember.mutate({ membershipId: member.id, data: { role: next } }, { onSuccess: refreshProvisioning, onError: showMutationError });
                   }}><Text style={[styles.status, { color: colors.primary, opacity: isDemoMode ? .5 : 1 }]}>Role</Text></Pressable>
                   <Pressable disabled={isDemoMode} accessibilityLabel={`Change store for ${member.email ?? 'member'}`} onPress={() => {
                     if (isDemoMode) return;
                     const stores = provisioning?.stores ?? [];
                    const current = stores.findIndex((store) => store.id === member.storeId);
                    const next = stores[(current + 1) % stores.length];
                    if (next) updateMember.mutate({ membershipId: member.id, data: { storeId: next.id } }, { onSuccess: refreshProvisioning, onError: showMutationError });
                   }}><Text style={[styles.status, { color: colors.primary, opacity: isDemoMode ? .5 : 1 }]}>Store</Text></Pressable>
                   <Pressable disabled={isDemoMode} accessibilityLabel={`Disable ${member.email ?? 'member'}`} onPress={() => { if (isDemoMode) return; updateMember.mutate({ membershipId: member.id, data: { status: member.status === 'disabled' ? 'invited' : 'disabled' } }, { onSuccess: refreshProvisioning, onError: showMutationError }); }}><Text style={[styles.status, { color: member.status === 'disabled' ? colors.accentForeground : colors.destructive, opacity: isDemoMode ? .5 : 1 }]}>{member.status === 'disabled' ? 'Enable' : 'Disable'}</Text></Pressable>
                </View>
              </View>
            ))}
             <TextInput value={memberEmail} onChangeText={setMemberEmail} editable={!isDemoMode} autoCapitalize="none" keyboardType="email-address" placeholder="person@company.com" placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { opacity: isDemoMode ? .6 : 1 }]} />
             <TextInput value={memberStoreId} onChangeText={setMemberStoreId} editable={!isDemoMode} placeholder="Store ID" placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { opacity: isDemoMode ? .6 : 1 }]} />
             <Pressable disabled={isDemoMode} onPress={() => setMemberRole(memberRole === 'employee' ? 'manager' : memberRole === 'manager' ? 'reviewer' : memberRole === 'reviewer' ? 'hq_admin' : 'employee')} style={[styles.typeToggle, { borderColor: colors.border, opacity: isDemoMode ? .6 : 1 }]}><Text style={[styles.typeText, { color: colors.foreground }]}>Role: {memberRole} · tap to change</Text></Pressable>
             <Pressable testID="invite-member" onPress={handleInvite} disabled={isDemoMode || inviteMember.isPending} style={[styles.adminButton, { backgroundColor: colors.primary, opacity: isDemoMode || inviteMember.isPending ? .5 : 1 }]}><Text style={styles.adminButtonText}>{isDemoMode ? 'Demo access is read-only' : 'Send invitation'}</Text></Pressable>
          </View>
        </View>
      )}

      <Text style={[styles.groupLabel, { color: colors.mutedForeground, marginTop: 25 }]}>ACCOUNT</Text>
      <Pressable style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, opacity: pressed ? .65 : 1 }]}>
        <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name="help-circle" size={18} color={colors.foreground} /></View>
        <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.foreground }]}>Help & support</Text><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Get help from the ausease team</Text></View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={profilePickerVisible} animationType="slide" transparent onRequestClose={() => setProfilePickerVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: `${colors.foreground}88` }]}>
          <View testID="profile-picker" style={[styles.modal, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Switch demo profile</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Preview each role without changing the signed-in account.</Text>
              </View>
              <Pressable accessibilityLabel="Close profile picker" onPress={() => setProfilePickerVisible(false)}><Feather name="x" size={21} color={colors.foreground} /></Pressable>
            </View>
            {profileOptions.map((option) => (
              <Pressable
                key={option.demoKey}
                testID={`demo-profile-option-${option.demoKey}`}
                accessibilityLabel={`Switch to ${option.displayName}`}
                onPress={() => { switchProfile(option.demoKey); setProfilePickerVisible(false); }}
                style={[styles.demoOption, { borderColor: option.demoKey === demoProfile.demoKey ? colors.primary : colors.border, backgroundColor: option.demoKey === demoProfile.demoKey ? colors.secondary : colors.card }]}
              >
                <View style={[styles.demoAvatar, { backgroundColor: colors.primary }]}><Text style={[styles.demoAvatarText, { color: colors.primaryForeground }]}>{option.initials}</Text></View>
                <View style={styles.demoOptionCopy}>
                  <Text style={[styles.demoOptionName, { color: colors.foreground }]}>{option.displayName}</Text>
                  <Text style={[styles.demoOptionRole, { color: colors.mutedForeground }]}>{option.roleLabel} · {option.store?.name}</Text>
                </View>
                {option.demoKey === demoProfile.demoKey && <Feather name="check" size={17} color={colors.primary} />}
              </Pressable>
            ))}
            <Pressable testID="exit-demo" onPress={() => { exitDemo(); setProfilePickerVisible(false); }} style={[styles.exitDemo, { borderColor: colors.border }]}>
              <Feather name="log-out" size={15} color={colors.foreground} />
              <Text style={[styles.exitDemoText, { color: colors.foreground }]}>Exit demo workspace</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={profileEditVisible} animationType="slide" transparent onRequestClose={() => setProfileEditVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: `${colors.foreground}88` }]}>
          <View testID="demo-profile-editor" style={[styles.modal, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit demo profile</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Preview identity only · your Clerk account and store access stay unchanged.</Text>
              </View>
              <Pressable accessibilityLabel="Close profile editor" onPress={() => setProfileEditVisible(false)}><Feather name="x" size={21} color={colors.foreground} /></Pressable>
            </View>
            <Text style={[styles.editLabel, { color: colors.foreground }]}>Display name</Text>
            <TextInput testID="demo-profile-name" value={profileName} onChangeText={setProfileName} autoCapitalize="words" placeholder="Your name" placeholderTextColor={colors.mutedForeground} style={[styles.profileEditInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]} />
            <Text style={[styles.editLabel, { color: colors.foreground }]}>Initials</Text>
            <TextInput testID="demo-profile-initials" value={profileInitials} onChangeText={setProfileInitials} autoCapitalize="characters" maxLength={4} placeholder="AC" placeholderTextColor={colors.mutedForeground} style={[styles.profileEditInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]} />
            <Text style={[styles.editLabel, { color: colors.foreground }]}>Role label</Text>
            <TextInput testID="demo-profile-role" value={profileRole} onChangeText={setProfileRole} placeholder="Store team member" placeholderTextColor={colors.mutedForeground} style={[styles.profileEditInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]} />
            <Pressable testID="save-demo-profile" onPress={saveProfile} style={[styles.adminButton, { backgroundColor: colors.primary }]}><Text style={styles.adminButtonText}>Save profile details</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={demoModalVisible} animationType="slide" transparent onRequestClose={() => setDemoModalVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: `${colors.foreground}88` }]}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Open private demo</Text>
                <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>Your team account is verified. Enter the private code to continue.</Text>
              </View>
              <Pressable accessibilityLabel="Close demo access" onPress={() => setDemoModalVisible(false)}><Feather name="x" size={21} color={colors.foreground} /></Pressable>
            </View>
            <TextInput testID="demo-access-code" value={demoCode} onChangeText={setDemoCode} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Team demo code" placeholderTextColor={colors.mutedForeground} style={[styles.demoInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]} onSubmitEditing={handleDemoAccess} />
            <Pressable testID="submit-demo-access" onPress={handleDemoAccess} disabled={demoBusy || !demoCode.trim()} style={[styles.adminButton, { backgroundColor: colors.primary, opacity: demoBusy || !demoCode.trim() ? .5 : 1 }]}>
              {demoBusy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.adminButtonText}>Verify and open demo</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  editorialKicker: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  kickerText: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 1 },
  profile: { borderRadius: 19, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
  profileAvatar: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { fontFamily: 'Inter_700Bold' },
  profileCopy: { flex: 1 },
  profileName: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  profileRole: { color: '#B9C4D0', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  profileWorkspace: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 4 },
  editProfileButton: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  editProfileText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  accessNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 11, borderRadius: 12, marginBottom: 16 },
  accessText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
  demoCard: { borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 17 },
  demoCardIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#ffffff14', alignItems: 'center', justifyContent: 'center' },
  demoTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  demoSub: { color: '#B9C4D0', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  demoOpen: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  demoOpenText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  demoBar: { borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  demoBarCopy: { flex: 1 },
  demoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  demoDot: { width: 6, height: 6, borderRadius: 3 },
  demoLabel: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: .9 },
  demoProfile: { color: '#B9C4D0', fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 4 },
  demoSwitchButton: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  demoSwitchText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  demoOption: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  demoAvatar: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  demoAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  demoOptionCopy: { flex: 1 },
  demoOptionName: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  demoOptionRole: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  exitDemo: { borderWidth: 1, borderRadius: 12, minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 7 },
  exitDemoText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  groupLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.1, marginBottom: 4 },
  row: { minHeight: 70, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  rowSub: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  auditCard: { borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, marginTop: 4 },
  auditHeader: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditRow: { minHeight: 53, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  auditDot: { width: 7, height: 7, borderRadius: 4 },
  auditAction: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  emptyAudit: { paddingBottom: 14, fontFamily: 'Inter_400Regular', fontSize: 11 },
  adminCard: { borderRadius: 15, borderWidth: 1, padding: 14, marginTop: 4, marginBottom: 10 },
  adminTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, marginBottom: 4 },
  adminInput: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 9 },
  typeToggle: { minHeight: 40, borderWidth: 1, borderRadius: 11, justifyContent: 'center', paddingHorizontal: 12, marginTop: 9 },
  typeText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  adminButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  adminButtonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
  adminListRow: { minHeight: 50, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8 },
  status: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  statusCopy: { alignItems: 'flex-end', maxWidth: 112 },
  version: { fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 3 },
  validationError: { fontFamily: 'Inter_500Medium', fontSize: 10, lineHeight: 14, marginTop: 4 },
  setupHint: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 11 },
  memberActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, marginBottom: 20 },
  modalTitle: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 21 },
  modalSub: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 5, maxWidth: 280 },
  demoInput: { height: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 14 },
  editLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 11, marginBottom: 5 },
  profileEditInput: { height: 45, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 13 },
});