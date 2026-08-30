import React from 'react';
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useDemo } from '@/context/DemoContext';
import { MenuTrigger, SliderMenu } from '@/components/BottomMenu';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// NativeTabs intentionally does NOT use custom design tokens — liquid glass
// is a system-level appearance provided by iOS and cannot be overridden.
// Custom brand colors are applied only on the ClassicTabLayout path (older iOS / Android / web).
function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tasks">
        <Icon sf={{ default: 'checklist', selected: 'checklist.checked' }} />
        <Label>Tasks</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="issues">
        <Icon sf={{ default: 'exclamationmark.bubble', selected: 'exclamationmark.bubble.fill' }} />
        <Label>Issues</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat">
        <Icon sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }} />
        <Label>Team</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="assistant">
        <Icon sf={{ default: 'sparkles', selected: 'sparkles' }} />
        <Label>AI Chat</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <Icon sf={{ default: 'ellipsis', selected: 'ellipsis' }} />
        <Label>Menu</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const [menuVisible, setMenuVisible] = React.useState(false);

  return (
    <Tabs
      tabBar={() => <BottomTabBar menuVisible={menuVisible} onMenuPress={() => setMenuVisible(true)} onMenuClose={() => setMenuVisible(false)} />}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
          tabBarLabelStyle: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 0.2, marginBottom: 2 },
          tabBarItemStyle: { paddingTop: 7, borderRadius: 14, marginHorizontal: 2, marginVertical: 5 },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
           borderTopLeftRadius: isWeb ? 20 : 0,
           borderTopRightRadius: isWeb ? 20 : 0,
          elevation: 0,
           display: 'none',
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.card },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color }) => <Feather name="check-square" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="issues"
        options={{
          title: 'Issues',
          tabBarIcon: ({ color }) => <Feather name="alert-circle" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Team Chat',
          tabBarIcon: ({ color }) => <Feather name="message-circle" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'AI Chat',
          tabBarIcon: ({ color }) => <Feather name="zap" size={21} color={color} />,
        }}
      />
      <Tabs.Screen name="more" options={{ href: null }} />
    </Tabs>
  );
}

function BottomTabBar({ menuVisible, onMenuPress, onMenuClose }: { menuVisible: boolean; onMenuPress: () => void; onMenuClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const tabs = [
    { name: 'Home', icon: 'home' as const, href: '/(tabs)' },
    { name: 'Tasks', icon: 'check-square' as const, href: '/(tabs)/tasks' },
    { name: 'Issues', icon: 'alert-circle' as const, href: '/(tabs)/issues' },
    { name: 'Team', icon: 'message-circle' as const, href: '/(tabs)/chat' },
    { name: 'AI Chat', icon: 'zap' as const, href: '/(tabs)/assistant' },
  ];
  const isSelected = (href: string) => href === '/(tabs)' ? pathname === '/' || pathname.endsWith('/(tabs)') : pathname.includes(href.split('/').pop() ?? '');
  return (
    <>
      <View style={[styles.customTabBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {tabs.map((tab) => {
          const selected = isSelected(tab.href);
          return (
            <Pressable key={tab.href} testID={`bottom-tab-${tab.name.toLowerCase().replace(' ', '-')}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => router.replace(tab.href as never)} style={({ pressed }) => [styles.customTab, { opacity: pressed ? .65 : 1 }]}>
              <Feather name={tab.icon} size={20} color={selected ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.customTabLabel, { color: selected ? colors.primary : colors.mutedForeground }]}>{tab.name}</Text>
            </Pressable>
          );
        })}
        <MenuTrigger onPress={onMenuPress} />
      </View>
      <SliderMenu visible={menuVisible} onClose={onMenuClose} />
    </>
  );
}

export default function TabLayout() {
  const { isSignedIn } = useAuth();
  const { isDemoMode } = useDemo();
  if (!isSignedIn && !isDemoMode) return <Redirect href={"/(auth)/sign-in" as never} />;
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  customTabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 67, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3, zIndex: 20 },
  customTab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  customTabLabel: { fontFamily: 'SpaceMono_700Bold', fontSize: 8.5, letterSpacing: .1 },
});
