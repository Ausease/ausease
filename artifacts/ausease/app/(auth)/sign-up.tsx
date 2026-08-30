import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth, useSignUp } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BrandBackdrop, BrandRule, NonInteractiveView } from '@/components/BrandDecor';
import { AuseaseLogo } from '@/components/AuseaseLogo';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signUp, errors, fetchStatus } = useSignUp();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isLoading = fetchStatus === 'fetching';
  const emailError = errors?.fields?.emailAddress?.message;
  const passwordError = errors?.fields?.password?.message;
  const codeError = errors?.fields?.code?.message;

  const finalizeSignUp = async () => {
    await signUp.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          setSubmitError('Your account needs one more verification step before it can continue.');
          return;
        }
        router.replace('/(tabs)' as never);
      },
    });
  };

  const handleSubmit = async () => {
    if (!emailAddress.trim() || !password) return;
    setSubmitError(null);
    try {
      const result = await signUp.password({
        emailAddress: emailAddress.trim(),
        password,
      });
      if (result.error) return;
      if (signUp.status === 'complete') {
        await finalizeSignUp();
        return;
      }
      if (signUp.status === 'missing_requirements' && signUp.unverifiedFields.includes('email_address')) {
        await signUp.verifications.sendEmailCode();
        return;
      }
      setSubmitError('Your account needs another required detail before it can be created.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Your account could not be created. Please try again.');
    }
  };

  const handleVerify = async () => {
    if (!verificationCode.trim()) return;
    setSubmitError(null);
    try {
      await signUp.verifications.verifyEmailCode({ code: verificationCode.trim() });
      if (signUp.status === 'complete') {
        await finalizeSignUp();
      } else {
        setSubmitError('That verification code was not accepted. Please try again.');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'That verification code was not accepted. Please try again.');
    }
  };

  if (isSignedIn) return <Redirect href={'/(tabs)' as never} />;

  if (signUp.status === 'missing_requirements' && signUp.unverifiedFields.includes('email_address')) {
    return (
      <View style={[styles.shell, { backgroundColor: colors.background }]}>
        <BrandBackdrop />
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 28 }]}
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topRow}><AuseaseLogo width={112} height={23} /><Text style={[styles.version, { color: colors.mutedForeground }]}>FIELD SYSTEM / 02</Text></View>
          <View style={[styles.heading, { marginTop: 120 }]}>
            <View style={styles.headingMarker}><Text style={[styles.eyebrow, { color: colors.primary }]}>VERIFY YOUR EMAIL</Text><BrandRule color={colors.accent} /></View>
            <Text style={[styles.title, { color: colors.foreground }]}>Check your inbox</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>We sent a verification code to confirm your new ausease account.</Text>
          </View>
          <Text style={[styles.label, { color: colors.foreground }]}>Verification code</Text>
          <TextInput
            testID="signup-verification-code"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            value={verificationCode}
            onChangeText={setVerificationCode}
            placeholder="Enter your code"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]}
          />
          {codeError && <Text style={[styles.error, { color: colors.destructive }]}>{codeError}</Text>}
          {submitError && <Text style={[styles.error, { color: colors.destructive }]}>{submitError}</Text>}
          <Pressable testID="signup-verification-submit" onPress={handleVerify} disabled={isLoading || !verificationCode.trim()} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed || isLoading ? .7 : (!verificationCode.trim() ? .5 : 1) }]}>
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Verify email</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></>}
          </Pressable>
          <Pressable testID="signup-resend" onPress={() => signUp.verifications.sendEmailCode()} disabled={isLoading} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? .7 : 1 }]}>
            <Feather name="refresh-cw" size={16} color={colors.foreground} /><Text style={[styles.secondaryText, { color: colors.foreground }]}>Send a new code</Text>
          </Pressable>
          <Pressable testID="signup-reset" onPress={() => { signUp.reset(); setVerificationCode(''); setSubmitError(null); }} style={({ pressed }) => [styles.resetButton, { opacity: pressed ? .7 : 1 }]}>
            <Text style={[styles.resetText, { color: colors.mutedForeground }]}>Use a different email</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={[styles.shell, { backgroundColor: colors.background }]}>
      <BrandBackdrop />
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 28 }]}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topRow}><AuseaseLogo width={112} height={23} /><Text style={[styles.version, { color: colors.mutedForeground }]}>FIELD SYSTEM / 02</Text></View>
        <View style={[styles.illustration, { backgroundColor: colors.foreground }]}>
          <View style={styles.illustrationLine}><View style={[styles.signalDot, { backgroundColor: colors.primary }]} /><View style={[styles.signalLine, { backgroundColor: colors.input }]} /><View style={[styles.signalDot, { backgroundColor: colors.primary }]} /></View>
          <NonInteractiveView style={[styles.illustrationOrbit, { borderColor: `${colors.accent}58` }]} />
          <Feather name="users" size={33} color={colors.card} />
          <Text style={styles.illustrationTitle}>Join your store team.</Text>
          <Text style={[styles.illustrationCopy, { color: colors.secondary }]}>A calmer way to keep people and operations in sync.</Text>
          <View style={styles.illustrationPill}><Feather name="check-circle" size={13} color={colors.accent} /><Text style={[styles.illustrationPillText, { color: colors.accent }]}>One workspace, every shift</Text></View>
        </View>
        <View style={styles.heading}><View style={styles.headingMarker}><Text style={[styles.eyebrow, { color: colors.primary }]}>GET STARTED</Text><BrandRule color={colors.accent} /></View><Text style={[styles.title, { color: colors.foreground }]}>Create your account</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Use your work email to join ausease.</Text></View>
        <Text style={[styles.label, { color: colors.foreground }]}>Work email</Text>
        <TextInput testID="signup-email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={emailAddress} onChangeText={setEmailAddress} placeholder="you@company.com" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} />
        {emailError && <Text style={[styles.error, { color: colors.destructive }]}>{emailError}</Text>}
        <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
        <View style={[styles.passwordWrap, { borderColor: colors.input, backgroundColor: colors.card }]}><TextInput testID="signup-password" autoCapitalize="none" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} placeholder="Create a secure password" placeholderTextColor={colors.mutedForeground} style={[styles.passwordInput, { color: colors.foreground }]} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((value) => !value)}><Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} /></Pressable></View>
        {passwordError && <Text style={[styles.error, { color: colors.destructive }]}>{passwordError}</Text>}
        {submitError && <Text style={[styles.error, { color: colors.destructive }]}>{submitError}</Text>}
        <Pressable testID="signup-submit" onPress={handleSubmit} disabled={isLoading || !emailAddress.trim() || !password} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed || isLoading ? .7 : (!emailAddress.trim() || !password ? .5 : 1) }]}>
          {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Create account</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></>}
        </Pressable>
        <View style={styles.accountRow}><Text style={[styles.accountPrompt, { color: colors.mutedForeground }]}>Already have an account?</Text><Pressable testID="sign-in-link" onPress={() => router.push('/(auth)/sign-in' as never)}><Text style={[styles.accountLink, { color: colors.foreground }]}>Sign in</Text></Pressable></View>
        <View nativeID="clerk-captcha" />
        <Text style={[styles.footer, { color: colors.mutedForeground }]}>ausease · Retail operations, made easier</Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  version: { fontFamily: 'SpaceMono_400Regular', fontSize: 8, letterSpacing: .8 },
  illustration: { borderRadius: 23, minHeight: 181, padding: 20, marginBottom: 29, overflow: 'hidden' },
  illustrationLine: { position: 'absolute', right: 22, top: 25, flexDirection: 'row', alignItems: 'center', gap: 6 },
  illustrationOrbit: { position: 'absolute', right: -26, top: 45, width: 150, height: 90, borderWidth: 1, borderRadius: 100, transform: [{ rotate: '-16deg' }] },
  signalDot: { width: 6, height: 6, borderRadius: 3 },
  signalLine: { width: 38, height: 1 },
  illustrationTitle: { fontFamily: 'BricolageGrotesque_700Bold', color: '#fff', fontSize: 21, marginTop: 15 },
  illustrationCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6 },
  illustrationPill: { alignSelf: 'flex-start', marginTop: 16, borderRadius: 13, backgroundColor: '#ffffff14', paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  illustrationPillText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  heading: { marginBottom: 22 },
  headingMarker: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  eyebrow: { fontFamily: 'SpaceMono_700Bold', fontSize: 10, letterSpacing: 1.2, marginBottom: 8 },
  title: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 27, letterSpacing: -.7 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 7 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7, marginTop: 13 },
  input: { height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 },
  passwordWrap: { height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  button: { height: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 25 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  secondaryButton: { height: 50, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 12 },
  secondaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  accountRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 17 },
  accountPrompt: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  accountLink: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  resetButton: { alignItems: 'center', paddingVertical: 18 },
  resetText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  footer: { textAlign: 'center', fontFamily: 'SpaceMono_400Regular', fontSize: 9, marginTop: 'auto', paddingTop: 26 },
});