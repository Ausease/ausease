import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function NonInteractiveView({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const webPointerStyle = Platform.OS === 'web'
    ? ({ pointerEvents: 'none' } as unknown as ViewStyle)
    : undefined;
  return (
    <View
      pointerEvents={Platform.OS === 'web' ? undefined : 'none'}
      style={[style, webPointerStyle]}
    >
      {children}
    </View>
  );
}

/**
 * Quiet, non-interactive artwork for the Ausease editorial system.
 * It deliberately lives in its own absolute layer so it can never sit
 * above a control or change the scroll/touch surface.
 */
export function BrandBackdrop({ variant = 'default' }: { variant?: 'default' | 'hero' | 'minimal' } = {}) {
  const colors = useColors();
  return (
    <NonInteractiveView style={styles.canvas}>
      {variant !== 'minimal' && <View style={[styles.gridField, { borderColor: `${colors.foreground}10` }]}>
        {Array.from({ length: 6 }).map((_, index) => (
          <View
            key={`vertical-${index}`}
            style={[styles.gridVertical, { left: 26 + index * 48, backgroundColor: `${colors.foreground}0C` }]}
          />
        ))}
        {Array.from({ length: 5 }).map((_, index) => (
          <View
            key={`horizontal-${index}`}
            style={[styles.gridHorizontal, { top: 32 + index * 48, backgroundColor: `${colors.foreground}0C` }]}
          />
        ))}
      </View>}
      <View style={[styles.orbit, { borderColor: `${colors.primary}45` }]} />
      {variant === 'hero' && <View style={[styles.orbitHero, { borderColor: `${colors.accentForeground}38` }]} />}
      <View style={[styles.orbitInner, { borderColor: `${colors.accent}78` }]} />
      <View style={[styles.dot, { backgroundColor: colors.accent }]} />
    </NonInteractiveView>
  );
}

/** Backwards-compatible name for screens that use the variant-based primitive. */
export function BrandDecor({ variant = 'default' }: { variant?: 'default' | 'hero' | 'minimal' }) {
  return <BrandBackdrop variant={variant} />;
}

export function BrandRule({ color }: { color?: string }) {
  const colors = useColors();
  return <NonInteractiveView style={[styles.rule, { backgroundColor: color ?? colors.primary }]} />;
}

const styles = StyleSheet.create({
  canvas: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  gridField: { position: 'absolute', top: -35, right: -42, width: 300, height: 285, borderWidth: 1, transform: [{ rotate: '-7deg' }] },
  gridVertical: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  gridHorizontal: { position: 'absolute', left: 0, right: 0, height: 1 },
  orbit: { position: 'absolute', top: 112, right: -92, width: 250, height: 112, borderWidth: 1, borderRadius: 125, transform: [{ rotate: '-18deg' }] },
  orbitHero: { position: 'absolute', top: 70, right: -25, width: 180, height: 105, borderWidth: 1, borderRadius: 100, transform: [{ rotate: '-16deg' }] },
  orbitInner: { position: 'absolute', top: 139, right: -44, width: 138, height: 62, borderWidth: 1, borderRadius: 70, transform: [{ rotate: '-18deg' }] },
  dot: { position: 'absolute', top: 183, right: 47, width: 7, height: 7, borderRadius: 4 },
  rule: { height: 3, width: 28, borderRadius: 2 },
});