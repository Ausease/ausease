import React from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetEnterpriseProfile,
  useGetEnterpriseProvisioning,
  useUpdateEnterpriseStoreGeofence,
} from '@workspace/api-client-react';
import { Header, Screen } from '@/components/Screen';
import { BrandRule } from '@/components/BrandDecor';
import { useColors } from '@/hooks/useColors';
import { useDemo } from '@/context/DemoContext';

const parseNumber = (value: string) => Number(value.trim());

export default function StoreSettingsScreen() {
  const colors = useColors();
  const { isDemoMode, profile: demoProfile, data: demoData } = useDemo();
  const queryClient = useQueryClient();
  const { storeId } = useLocalSearchParams<{ storeId?: string }>();
  const profileQuery = useGetEnterpriseProfile({ query: { queryKey: ['enterprise-profile'], enabled: !isDemoMode, retry: false } });
  const isHqAdmin = (isDemoMode ? demoProfile.role : profileQuery.data?.role) === 'hq_admin';
  const provisioningQuery = useGetEnterpriseProvisioning({
    query: { queryKey: ['/api/admin/provisioning'], enabled: !isDemoMode && isHqAdmin, retry: false },
  });
  const provisioning = isDemoMode ? demoData.provisioning : provisioningQuery.data;
  const store = provisioning?.stores.find((item) => item.id === storeId) ?? (isDemoMode ? demoData.provisioning.stores[0] : undefined);
  const updateGeofence = useUpdateEnterpriseStoreGeofence();
  const [latitude, setLatitude] = React.useState('');
  const [longitude, setLongitude] = React.useState('');
  const [radius, setRadius] = React.useState('');
  const [geofenceEnabled, setGeofenceEnabled] = React.useState(true);
  const [errors, setErrors] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!store) return;
    setLatitude(store.latitude == null ? '' : String(store.latitude));
    setLongitude(store.longitude == null ? '' : String(store.longitude));
    setRadius(String(store.geofenceRadiusMeters ?? 150));
    setGeofenceEnabled(store.geofenceEnabled !== false);
  }, [store?.id, store?.latitude, store?.longitude, store?.geofenceRadiusMeters, store?.geofenceEnabled]);

  const inputStyle = [styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: errors.length ? colors.destructive : colors.input }];
  const validate = () => {
    const nextErrors: string[] = [];
    const lat = parseNumber(latitude);
    const lng = parseNumber(longitude);
    const radiusMeters = parseNumber(radius);
    if (!latitude.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90) nextErrors.push('Latitude must be between −90 and 90.');
    if (!longitude.trim() || !Number.isFinite(lng) || lng < -180 || lng > 180) nextErrors.push('Longitude must be between −180 and 180.');
    if (!radius.trim() || !Number.isFinite(radiusMeters) || radiusMeters < 25 || radiusMeters > 2000) nextErrors.push('Radius must be between 25 and 2,000 metres.');
    setErrors(nextErrors);
    return nextErrors.length === 0 ? { latitude: lat, longitude: lng, geofenceRadiusMeters: radiusMeters, geofenceEnabled } : null;
  };

  const handleSave = async () => {
    if (isDemoMode) {
      Alert.alert('Preview only', 'Store settings are read-only in the demo workspace.');
      return;
    }
    if (!storeId || !store) return;
    const data = validate();
    if (!data) return;
    try {
      await updateGeofence.mutateAsync({ storeId, data });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/admin/provisioning'] }),
        queryClient.invalidateQueries({ queryKey: ['enterprise-audit'] }),
      ]);
      setErrors([]);
      Alert.alert('Geofence saved', `${store.name}'s location settings were updated and recorded in audit history.`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Could not save the geofence. Please try again.']);
    }
  };

  if (!isHqAdmin) {
    return (
      <Screen>
        <Header eyebrow="ausease" title="Store settings" action="arrow-left" onAction={() => router.back()} />
        <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
          <Feather name="lock" size={16} color={colors.foreground} />
          <Text style={[styles.noticeText, { color: colors.foreground }]}>Only headquarters administrators can manage store geofences.</Text>
        </View>
      </Screen>
    );
  }

  if (!isDemoMode && (provisioningQuery.isLoading || profileQuery.isLoading)) {
    return <Screen><Header eyebrow="ausease" title="Store settings" action="arrow-left" onAction={() => router.back()} /><Text style={[styles.helper, { color: colors.mutedForeground }]}>Loading store settings…</Text></Screen>;
  }

  if (!store) {
    return (
      <Screen>
        <Header eyebrow="ausease" title="Store settings" action="arrow-left" onAction={() => router.back()} />
        <View style={[styles.notice, { backgroundColor: '#FCE4E0' }]}>
          <Feather name="alert-circle" size={16} color={colors.destructive} />
          <Text style={[styles.noticeText, { color: colors.destructive }]}>That store could not be found in your organization.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header eyebrow="Headquarters admin" title="Store settings" action="arrow-left" onAction={() => router.back()} />
       <View style={styles.editorialKicker}><Text style={[styles.kickerText, { color: colors.primary }]}>HQ / LOCATION CONTROL</Text><BrandRule color={colors.accent} /></View>
       {isDemoMode && <View style={[styles.demoNotice, { backgroundColor: colors.secondary }]}><Feather name="eye" size={15} color={colors.secondaryForeground} /><Text style={[styles.noticeText, { color: colors.secondaryForeground }]}>Preview only · these settings are read-only and never saved</Text></View>}
       <Text style={[styles.storeName, { color: colors.foreground }]}>{store.name}</Text>
      <Text style={[styles.helper, { color: colors.mutedForeground }]}>Set the location and radius used to verify staff presence at this store.</Text>
      <View style={[styles.statusCard, { backgroundColor: geofenceEnabled ? colors.accent : '#FCE4E0' }]}>
        <View style={styles.statusCopy}>
          <Text style={[styles.statusTitle, { color: colors.foreground }]}>{geofenceEnabled ? 'Geofence enforcement is on' : 'Geofence enforcement is paused'}</Text>
          <Text style={[styles.statusDescription, { color: colors.mutedForeground }]}>{geofenceEnabled ? 'Staff must be inside the configured radius to check in.' : 'Staff can check in without location verification until you re-enable it.'}</Text>
        </View>
         <Switch disabled={isDemoMode} accessibilityLabel="Toggle geofence enforcement" value={geofenceEnabled} onValueChange={setGeofenceEnabled} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
      </View>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.foreground }]}>Latitude</Text>
         <TextInput editable={!isDemoMode} value={latitude} onChangeText={(value) => { setLatitude(value); setErrors([]); }} keyboardType="numbers-and-punctuation" placeholder="e.g. −33.8688" placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { opacity: isDemoMode ? .6 : 1 }]} />
        <Text style={[styles.range, { color: colors.mutedForeground }]}>Range: −90 to 90</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Longitude</Text>
         <TextInput editable={!isDemoMode} value={longitude} onChangeText={(value) => { setLongitude(value); setErrors([]); }} keyboardType="numbers-and-punctuation" placeholder="e.g. 151.2093" placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { opacity: isDemoMode ? .6 : 1 }]} />
        <Text style={[styles.range, { color: colors.mutedForeground }]}>Range: −180 to 180</Text>
        <Text style={[styles.label, { color: colors.foreground }]}>Geofence radius (metres)</Text>
         <TextInput editable={!isDemoMode} value={radius} onChangeText={(value) => { setRadius(value); setErrors([]); }} keyboardType="numbers-and-punctuation" placeholder="e.g. 150" placeholderTextColor={colors.mutedForeground} style={[...inputStyle, { opacity: isDemoMode ? .6 : 1 }]} />
        <Text style={[styles.range, { color: colors.mutedForeground }]}>Range: 25 to 2,000 metres</Text>
        {errors.map((error) => <Text key={error} style={[styles.error, { color: colors.destructive }]}>{error}</Text>)}
         <Pressable onPress={handleSave} disabled={isDemoMode || updateGeofence.isPending} style={[styles.button, { backgroundColor: colors.primary, opacity: isDemoMode || updateGeofence.isPending ? .5 : 1 }]}>
           <Text style={styles.buttonText}>{isDemoMode ? 'Demo settings are read-only' : updateGeofence.isPending ? 'Saving…' : 'Save geofence'}</Text>
        </Pressable>
      </View>
      <View style={[styles.auditHint, { backgroundColor: colors.secondary }]}>
        <Feather name="shield" size={15} color={colors.foreground} />
        <Text style={[styles.noticeText, { color: colors.foreground }]}>Every successful update is recorded in audit history for accountability.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  editorialKicker: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 10 },
  kickerText: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 1 },
  storeName: { fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 5 },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginBottom: 18 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 14 },
  statusCopy: { flex: 1 },
  statusTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  statusDescription: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 },
  card: { borderRadius: 15, borderWidth: 1, padding: 15 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 12 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 7 },
  range: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 5 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, marginTop: 8 },
  button: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },
   demoNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 12, marginBottom: 14 },
   notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: 12 },
  auditHint: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: 12, marginTop: 14 },
  noticeText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
});