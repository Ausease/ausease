import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { checkInToStore, getPresenceStatus, getGetPresenceStatusQueryKey, type PresenceStatus } from '@workspace/api-client-react';
import { useDemo } from './DemoContext';

type PresenceContextValue = {
  status?: PresenceStatus;
  permission: Location.LocationPermissionResponse | null;
  loading: boolean;
  checkingIn: boolean;
  error?: string;
  checkIn: () => Promise<void>;
  requestPermission: () => Promise<void>;
  refresh: () => Promise<void>;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const { isDemoMode, data: demoData } = useDemo();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = Location.useForegroundPermissions();
  const [status, setStatus] = useState<PresenceStatus>();
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (isDemoMode) {
      setStatus(demoData.presence);
      setError(undefined);
      return;
    }
    if (!isSignedIn) return;
    setLoading(true);
    try {
      setStatus(await getPresenceStatus());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Presence could not be verified.');
    } finally {
      setLoading(false);
    }
  }, [demoData.presence, isDemoMode, isSignedIn]);

  const ensurePermission = useCallback(async () => {
    if (isDemoMode) return true;
    if (Platform.OS === 'web') return true;
    if (permission?.granted) return true;
    const next = await requestPermission();
    if (next.granted) return true;
    if (!next.canAskAgain) {
      Alert.alert('Location permission needed', 'Open Settings and allow ausease to verify your store location.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
      ]);
    }
    setError('Location permission is needed to check in at the store.');
    return false;
  }, [isDemoMode, permission, requestPermission]);

  const checkIn = useCallback(async () => {
    if (isDemoMode) {
      setStatus(demoData.presence);
      setError(undefined);
      return;
    }
    setCheckingIn(true);
    setError(undefined);
    try {
      if (!(await ensurePermission())) return;
      if (Platform.OS === 'web') {
        setError('Store check-in is available in the mobile app, not in the browser preview.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await checkInToStore({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy ?? undefined,
      });
      await queryClient.invalidateQueries({ queryKey: getGetPresenceStatusQueryKey() });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check-in failed. Try again inside the store.');
    } finally {
      setCheckingIn(false);
    }
  }, [demoData.presence, ensurePermission, isDemoMode, queryClient, refresh]);

  const value = useMemo(() => ({
    status, permission, loading, checkingIn, error, checkIn, requestPermission: async () => { await ensurePermission(); }, refresh,
  }), [status, permission, loading, checkingIn, error, checkIn, ensurePermission, refresh]);

  useEffect(() => {
    if (isDemoMode || isSignedIn) void refresh();
  }, [isDemoMode, isSignedIn, refresh]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const value = useContext(PresenceContext);
  if (!value) throw new Error('usePresence must be used inside PresenceProvider');
  return value;
}