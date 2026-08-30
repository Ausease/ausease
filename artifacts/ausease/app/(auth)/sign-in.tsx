import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth, useSignIn, useSSO } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BrandBackdrop, BrandRule, NonInteractiveView } from '@/components/BrandDecor';
import { AuseaseLogo } from '@/components/AuseaseLogo';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [biometricType, setBiometricType] = useState<'Face ID' | 'biometrics' | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const isLoading = fetchStatus === 'fetching';
  const errorMessage = errors?.fields?.identifier?.message ?? errors?.fields?.password?.message ?? submitError;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) return;
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      setBiometricType(types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'Face ID' : 'biometrics');
    })();
  }, []);

  const handleSubmit = async () => {
    if (!emailAddress.trim() || !password) return;
    setSubmitError(null);
    try {
      const result = await signIn.password({ emailAddress: emailAddress.trim(), password });
      if (result.error) return;
      if (signIn.status === 'complete') {
        await signIn.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) {
              setSubmitError('Your account needs one more verification step before it can sign in.');
              return;
            }
            router.replace('/(tabs)' as never);
          },
        });
        return;
      }
      if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        const emailFactor = signIn.supportedSecondFactors?.find((factor) => factor.strategy === 'email_code');
        if (signIn.status === 'needs_client_trust' || emailFactor) {
          await signIn.mfa.sendEmailCode();
          setSubmitError(null);
          return;
        }
      }
      setSubmitError('Your sign-in needs an additional verification step. Please retry or use SSO.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Sign-in could not be completed. Please try again.');
    }
  };

  const handleVerify = async () => {
    if (!verificationCode.trim()) return;
    setSubmitError(null);
    try {
      await signIn.mfa.verifyEmailCode({ code: verificationCode.trim() });
      if (signIn.status === 'complete') {
        await signIn.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) {
              setSubmitError('Your account needs one more verification step before it can sign in.');
              return;
            }
            router.replace('/(tabs)' as never);
          },
        });
      } else {
        setSubmitError('That verification code was not accepted. Please try again.');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'That verification code was not accepted. Please try again.');
    }
  };

  const handleSso = useCallback(async () => {
    const domain = emailAddress.trim().toLowerCase().split('@')[1] ?? '';
    if (!domain) {
      Alert.alert('Enter your work email', 'We use your email domain to choose the right single sign-on provider.');
      return;
    }
    const microsoftDomains = ['outlook.com', 'hotmail.com', 'live.com', 'microsoft.com', 'office365.com'];
    const appleDomains = ['icloud.com', 'me.com', 'mac.com'];
    const githubDomains = ['github.com'];
    const strategy = microsoftDomains.includes(domain)
      ? 'oauth_microsoft'
      : appleDomains.includes(domain)
        ? 'oauth_apple'
        : githubDomains.includes(domain)
          ? 'oauth_github'
          : 'oauth_google';
    const provider = strategy === 'oauth_microsoft' ? 'Microsoft' : strategy === 'oauth_apple' ? 'Apple' : strategy === 'oauth_github' ? 'GitHub' : 'Google';
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'ausease', path: 'sign-in/sso-callback' }),
      });
      if (createdSessionId) {
        await setActive?.({
          session: createdSessionId,
          navigate: ({ session }) => {
            if (session?.currentTask) return;
            router.replace('/(tabs)' as never);
          },
        });
      }
    } catch (error) {
      Alert.alert(`${provider} SSO unavailable`, error instanceof Error ? error.message : 'Please try your work email and password instead.');
    }
  }, [emailAddress, router, startSSOFlow]);

  const handleBiometric = async () => {
    if (!biometricType || biometricBusy) return;
    setBiometricBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Verify with ${biometricType}`,
        fallbackLabel: 'Use password',
        disableDeviceFallback: false,
      });
      if (result.success) {
        Alert.alert('Device verified', 'Your identity was verified on this device. Use your store password once to establish the secure Clerk session; future launches can keep the session active.');
      }
    } finally {
      setBiometricBusy(false);
    }
  };

  if (isSignedIn) return <Redirect href={'/(tabs)' as never} />;
  if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
    return (
      <View style={[styles.shell, { backgroundColor: colors.background }]}>
        <BrandBackdrop />
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 28 }]}
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topRow}><AuseaseLogo width={112} height={23} /><Text style={[styles.version, { color: colors.mutedForeground }]}>FIELD SYSTEM / 01</Text></View>
          <View style={[styles.heading, { marginTop: 120 }]}>
            <View style={styles.headingMarker}><Text style={[styles.eyebrow, { color: colors.primary }]}>SECURITY CHECK</Text><BrandRule color={colors.accent} /></View>
            <Text style={[styles.title, { color: colors.foreground }]}>Check your email</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>We sent a verification code to confirm this device.</Text>
          </View>
          <Text style={[styles.label, { color: colors.foreground }]}>Verification code</Text>
          <TextInput
            testID="login-verification-code"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            value={verificationCode}
            onChangeText={setVerificationCode}
            placeholder="Enter your code"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]}
          />
          {submitError && <Text style={[styles.error, { color: colors.destructive }]}>{submitError}</Text>}
          <Pressable testID="login-verification-submit" onPress={handleVerify} disabled={isLoading || !verificationCode.trim()} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed || isLoading ? .7 : (!verificationCode.trim() ? .5 : 1) }]}>
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Verify device</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></>}
          </Pressable>
          <Pressable testID="login-verification-resend" onPress={() => signIn.mfa.sendEmailCode()} disabled={isLoading} style={({ pressed }) => [styles.ssoButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? .7 : 1, marginTop: 12 }]}>
            <Feather name="refresh-cw" size={16} color={colors.foreground} /><Text style={[styles.ssoText, { color: colors.foreground }]}>Send a new code</Text>
          </Pressable>
          <Pressable testID="login-verification-reset" onPress={() => { signIn.reset(); setVerificationCode(''); setSubmitError(null); }} style={({ pressed }) => [styles.resetButton, { opacity: pressed ? .7 : 1 }]}>
            <Text style={[styles.resetText, { color: colors.mutedForeground }]}>Use a different account</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return <View style={[styles.shell, { backgroundColor: colors.background }]}>
    <BrandBackdrop />
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 28 }]}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
    >
    <View style={styles.topRow}><AuseaseLogo width={112} height={23} /><Text style={[styles.version, { color: colors.mutedForeground }]}>FIELD SYSTEM / 01</Text></View>
    <View style={[styles.illustration, { backgroundColor: colors.foreground }]}><View style={styles.illustrationLine}><View style={[styles.signalDot, { backgroundColor: colors.primary }]} /><View style={[styles.signalLine, { backgroundColor: colors.input }]} /><View style={[styles.signalDot, { backgroundColor: colors.primary }]} /></View><NonInteractiveView style={[styles.illustrationOrbit, { borderColor: `${colors.accent}58` }]} /><Feather name="briefcase" size={33} color={colors.card} /><Text style={styles.illustrationTitle}>Your store, in sync.</Text><Text style={[styles.illustrationCopy, { color: colors.secondary }]} >Tasks, people, and operations in one calm place.</Text><View style={styles.illustrationPill}><Feather name="check-circle" size={13} color={colors.accent} /><Text style={[styles.illustrationPillText, { color: colors.accent }]}>Pitt Street team workspace</Text></View></View>
    <View style={styles.heading}><View style={styles.headingMarker}><Text style={[styles.eyebrow, { color: colors.primary }]}>WELCOME BACK</Text><BrandRule color={colors.accent} /></View><Text style={[styles.title, { color: colors.foreground }]}>Sign in to ausease</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Use your store account to continue.</Text></View>
    <Text style={[styles.label, { color: colors.foreground }]}>Work email</Text>
    <TextInput testID="login-email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={emailAddress} onChangeText={setEmailAddress} placeholder="you@company.com" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card }]} />
    <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
    <View style={[styles.passwordWrap, { borderColor: colors.input, backgroundColor: colors.card }]}><TextInput testID="login-password" autoCapitalize="none" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} placeholder="Enter your password" placeholderTextColor={colors.mutedForeground} style={[styles.passwordInput, { color: colors.foreground }]} /><Pressable accessibilityRole="button" onPress={() => setShowPassword((value) => !value)}><Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} /></Pressable></View>
    {errorMessage && <Text style={[styles.error, { color: colors.destructive }]}>{errorMessage}</Text>}
    <Pressable testID="login-submit" onPress={handleSubmit} disabled={isLoading || !emailAddress || !password} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed || isLoading ? .7 : (!emailAddress || !password ? .5 : 1) }]}>{isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Continue</Text><Feather name="arrow-right" size={18} color={colors.primaryForeground} /></>}</Pressable>
    <View style={styles.orRow}><View style={[styles.orLine, { backgroundColor: colors.border }]} /><Text style={[styles.orText, { color: colors.mutedForeground }]}>OR</Text><View style={[styles.orLine, { backgroundColor: colors.border }]} /></View>
    <Pressable testID="sso-submit" onPress={handleSso} disabled={isLoading} style={({ pressed }) => [styles.ssoButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? .7 : 1 }]}><Feather name="globe" size={17} color={colors.foreground} /><Text style={[styles.ssoText, { color: colors.foreground }]}>Continue with SSO</Text></Pressable>
    {biometricType && <Pressable testID="biometric-submit" onPress={handleBiometric} disabled={biometricBusy} style={({ pressed }) => [styles.biometricButton, { borderColor: colors.border, opacity: pressed || biometricBusy ? .7 : 1 }]}>{biometricBusy ? <ActivityIndicator color={colors.primary} /> : <Feather name="shield" size={17} color={colors.primary} />}<Text style={[styles.biometricText, { color: colors.foreground }]}>Continue with {biometricType}</Text></Pressable>}
     <View style={styles.accountRow}><Text style={[styles.accountPrompt, { color: colors.mutedForeground }]}>New to ausease?</Text><Pressable testID="sign-up-link" onPress={() => router.push('/(auth)/sign-up' as never)}><Text style={[styles.accountLink, { color: colors.foreground }]}>Create an account</Text></Pressable></View>
    <View style={styles.helpRow}><Feather name="info" size={14} color={colors.mutedForeground} /><Text style={[styles.helpText, { color: colors.mutedForeground }]}>Need access? Ask your store manager for an invitation.</Text></View>
    <Text style={[styles.footer, { color: colors.mutedForeground }]}>ausease · Retail operations, made easier</Text>
    </KeyboardAwareScrollViewCompat>
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }, logoImage: { width: 112, height: 39 }, version: { fontFamily: 'SpaceMono_400Regular', fontSize: 8, letterSpacing: .8 },
  illustration: { borderRadius: 23, minHeight: 181, padding: 20, marginBottom: 29, overflow: 'hidden' }, illustrationLine: { position: 'absolute', right: 22, top: 25, flexDirection: 'row', alignItems: 'center', gap: 6 }, illustrationOrbit: { position: 'absolute', right: -26, top: 45, width: 150, height: 90, borderWidth: 1, borderRadius: 100, transform: [{ rotate: '-16deg' }] }, signalDot: { width: 6, height: 6, borderRadius: 3 }, signalLine: { width: 38, height: 1 }, illustrationTitle: { fontFamily: 'BricolageGrotesque_700Bold', color: '#fff', fontSize: 21, marginTop: 15 }, illustrationCopy: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6 }, illustrationPill: { alignSelf: 'flex-start', marginTop: 16, borderRadius: 13, backgroundColor: '#ffffff14', paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 }, illustrationPillText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
     heading: { marginBottom: 22 }, headingMarker: { flexDirection: 'row', alignItems: 'center', gap: 9 }, eyebrow: { fontFamily: 'SpaceMono_700Bold', fontSize: 10, letterSpacing: 1.2, marginBottom: 8 }, title: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 27, letterSpacing: -.7 }, subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 7 }, label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 7, marginTop: 13 }, input: { height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 14 }, passwordWrap: { height: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }, passwordInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14 }, error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 }, button: { height: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 25 }, buttonText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }, orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 17 }, orLine: { flex: 1, height: 1 }, orText: { fontFamily: 'SpaceMono_700Bold', fontSize: 10, letterSpacing: 1 }, ssoButton: { height: 50, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, ssoText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 }, accountRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 17 }, accountPrompt: { fontFamily: 'Inter_400Regular', fontSize: 12 }, accountLink: { fontFamily: 'Inter_700Bold', fontSize: 12 }, demoButton: { minHeight: 59, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginTop: 10 }, demoButtonTitle: { fontFamily: 'Inter_700Bold', fontSize: 13 }, demoButtonCopy: { color: '#B9C4D0', fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 }, biometricButton: { height: 50, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 10 }, biometricText: { fontFamily: 'Inter_500Medium', fontSize: 13 }, helpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 }, helpText: { fontFamily: 'Inter_400Regular', fontSize: 11 }, footer: { textAlign: 'center', fontFamily: 'SpaceMono_400Regular', fontSize: 9, marginTop: 'auto', paddingTop: 26 }, resetButton: { alignItems: 'center', paddingVertical: 18 }, resetText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});