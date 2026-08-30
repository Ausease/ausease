import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useColors } from '@/hooks/useColors';
import { BrandRule } from '@/components/BrandDecor';
import { Screen } from '@/components/Screen';
import { useOperations } from '@/context/OperationsContext';
import { useDemo } from '@/context/DemoContext';
import { useAskOperationsAssistant } from '@workspace/api-client-react';

type AssistantMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  task?: string;
  taskDetails?: string;
  confirmationRequest?: string;
};

const makeWelcome = (name: string): AssistantMessage => ({
  id: 'welcome',
  role: 'assistant',
  text: `Hi ${name.split(' ')[0]}. I can assign tasks, check pending work, summarize store issues, find SOP guidance, and mention teammates. Ask naturally — for example, “What still needs doing?”`,
});

export default function AssistantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addTask, addMessage, tasks, issues } = useOperations();
  const { isDemoMode, isReadOnly, profile } = useDemo();
  const askAssistant = useAskOperationsAssistant();
  const [messages, setMessages] = useState<AssistantMessage[]>([makeWelcome(isDemoMode ? profile.displayName : 'Alex Carter')]);
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const recording = useRef<Audio.Recording | null>(null);
  const recognition = useRef<any>(null);
  const [voiceSupported, setVoiceSupported] = useState(true);

  useEffect(() => () => { recording.current?.stopAndUnloadAsync().catch(() => undefined); }, []);
  useEffect(() => {
    setMessages([makeWelcome(isDemoMode ? profile.displayName : 'Alex Carter')]);
    setDraft('');
  }, [isDemoMode, profile.demoKey]);

  const addAssistantMessage = (response: { message: string; task?: { title: string; assignee?: string; area?: string; due?: string; priority?: 'high' | 'normal' }; confirmationRequired?: boolean }, request: string) => {
    if (response.task) {
      addTask(response.task.title, response.task.assignee, {
        area: response.task.area,
        due: response.task.due,
        priority: response.task.priority,
      });
      addMessage(`Assistant assignment: ${response.task.title} → ${response.task.assignee ?? 'unassigned'} (${response.task.due}, ${response.task.priority ?? 'normal'} priority)`);
    }
    setMessages((current) => [...current, {
      id: `${Date.now()}-a`,
      role: 'assistant',
      text: response.message,
      task: response.task?.title,
      taskDetails: response.task ? `${response.task.assignee ?? 'Unassigned'} · ${response.task.area} · ${response.task.due} · ${response.task.priority === 'high' ? 'Priority' : 'Standard'}` : undefined,
      confirmationRequest: response.confirmationRequired ? request : undefined,
    }]);
  };

  const respond = async (request: string, confirmed = false) => {
    const clean = request.trim();
    if (!clean || busy) return;
    setDraft('');
    setBusy(true);
    setMessages((current) => [...current, { id: `${Date.now()}-u`, role: 'user', text: clean }]);
    try {
      if (!isDemoMode) {
        try {
          const serverResponse = await askAssistant.mutateAsync({ data: { request: clean, confirmed, tasks, issues } });
          addAssistantMessage({ message: serverResponse.message, task: serverResponse.task ?? undefined, confirmationRequired: serverResponse.confirmationRequired }, clean);
          return;
        } catch {
          // Keep the existing local parser available when the store is offline.
        }
      }
      const lower = clean.toLowerCase();
      const assignment = lower.match(/assign\s+([a-z]+)(?:\s+the|\s+to)?\s+(.+?)(?:\s+checklist)?$/i);
      const pending = tasks.filter((item) => !item.done).length;
      const response = assignment && !(isDemoMode && isReadOnly)
        ? { message: `Done — I assigned ${assignment[1].replace(/^\w/, (letter) => letter.toUpperCase())} the ${assignment[2].trim()}. It’s now in the team task list.`, task: { title: `${assignment[2].trim().replace(/^\w/, (letter) => letter.toUpperCase())} checklist`, assignee: assignment[1].replace(/^\w/, (letter) => letter.toUpperCase()), area: 'Store operations', due: 'Due today', priority: 'normal' as const } }
        : isDemoMode && isReadOnly
          ? { message: 'This viewer profile is read-only. Switch to an employee, manager, reviewer, or headquarters profile to try an assistant action.' }
        : lower.includes('pending') || lower.includes('outstanding')
          ? { message: `There are ${pending} open tasks in your store today. I can also assign a new checklist if you tell me who it’s for.` }
          : { message: 'I can help assign checklists, check pending work, summarize issues, or find an SOP. Try: “Assign Alex the start-of-day checklist.”' };
      addAssistantMessage(response, clean);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Please try again.';
      setMessages((current) => [...current, { id: `${Date.now()}-a`, role: 'assistant', text: `I couldn’t reach the operations service. ${detail}` }]);
    } finally {
      setBusy(false);
    }
  };

  const getRecordingMimeType = (uri: string) => {
    const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
    if (extension === 'wav') return 'audio/wav';
    if (extension === 'webm') return 'audio/webm';
    if (extension === 'mp3') return 'audio/mpeg';
    if (extension === 'm4a') return 'audio/m4a';
    if (extension === 'ogg') return 'audio/ogg';
    if (extension === 'aac') return 'audio/aac';
    if (extension === 'flac') return 'audio/flac';
    return 'audio/mp4';
  };

  const handleVoice = async () => {
    if (Platform.OS === 'web' && !listening) {
      const SpeechRecognition = (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setVoiceSupported(false);
        Alert.alert('Voice capture unavailable', 'This browser does not support speech recognition. Type your request below instead.');
        return;
      }
      const next = new SpeechRecognition();
      next.lang = 'en-AU';
      next.interimResults = false;
      next.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        setListening(false);
        if (transcript) void respond(transcript);
      };
      next.onerror = () => {
        setListening(false);
        Alert.alert('Voice request unavailable', 'Speech recognition could not hear that request. Type it below instead.');
      };
      next.onend = () => setListening(false);
      recognition.current = next;
      next.start();
      setListening(true);
      return;
    }
    if (listening) {
      if (Platform.OS === 'web' && recognition.current) {
        recognition.current.stop();
        recognition.current = null;
        setListening(false);
        return;
      }
      setListening(false);
      const active = recording.current;
      recording.current = null;
      if (!active) return;
      try {
        await active.stopAndUnloadAsync();
        const uri = active.getURI();
        if (!uri) throw new Error('No recording was captured.');
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        setDraft('Voice note captured. Please confirm the request below.');
        Alert.alert('Voice note captured', `Audio is ready for transcription. Type the request below to complete it now.\n\nFormat: Assign Alex the start-of-day checklist\n\nCaptured file: ${getRecordingMimeType(uri)}`);
      } catch (error) {
        Alert.alert('Voice request unavailable', error instanceof Error ? error.message : 'Please type the request instead.');
      }
      return;
    }
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission needed', 'Allow microphone access to record a request, or type it below.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: next } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recording.current = next;
      setVoiceSupported(true);
      setListening(true);
    } catch {
      setVoiceSupported(false);
      Alert.alert('Voice capture unavailable', 'This device cannot record here. Type your request below instead.');
    }
  };

  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }} keyboardVerticalOffset={0}>
    <Screen>
       <View style={styles.header}><View><View style={styles.aiEyebrow}><View style={[styles.aiDot, { backgroundColor: colors.primary }]} /><Text style={[styles.eyebrow, { color: colors.primary }]}>ausease ai</Text><BrandRule color={colors.accent} /></View><Text style={[styles.title, { color: colors.foreground }]}>AI Chat</Text></View><View style={[styles.aiBadge, { backgroundColor: colors.accent }]}><Feather name="zap" size={15} color={colors.accentForeground} /><Text style={[styles.aiBadgeText, { color: colors.accentForeground }]}>OPS ASSISTANT</Text></View></View>
       <View style={[styles.scope, { backgroundColor: colors.secondary }]}><Feather name={isReadOnly ? 'eye' : 'shield'} size={15} color={colors.secondaryForeground} /><Text style={[styles.scopeText, { color: colors.secondaryForeground }]}>{isReadOnly ? `Read-only viewer · ${profile.store?.name ?? 'All stores'} · browsing demo operations` : isDemoMode ? `Preview mode · ${profile.store?.name ?? 'All stores'} operations` : 'Connected to Pitt Street store operations'}</Text></View>
       <FlatList data={messages} keyExtractor={(item) => item.id} style={styles.list} contentContainerStyle={styles.listContent} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" renderItem={({ item }) => <View style={[styles.messageLine, item.role === 'user' && styles.userLine]}><View style={[styles.avatar, { backgroundColor: item.role === 'user' ? colors.foreground : colors.primary }]}><Feather name={item.role === 'user' ? 'user' : 'zap'} size={15} color="#fff" /></View><View style={[styles.bubble, { backgroundColor: item.role === 'user' ? colors.foreground : colors.card, borderColor: colors.border }]}><Text style={[styles.message, { color: item.role === 'user' ? '#fff' : colors.foreground }]}>{item.text}</Text>{item.confirmationRequest && <Pressable onPress={() => respond(item.confirmationRequest as string, true)} style={[styles.confirmButton, { backgroundColor: colors.primary }]}><Text style={styles.confirmText}>Confirm and assign</Text></Pressable>}{item.task && <View style={[styles.taskConfirmation, { backgroundColor: colors.accent }]}><Feather name="check-circle" size={15} color={colors.accentForeground} /><View><Text style={[styles.taskConfirmationText, { color: colors.accentForeground }]}>Task thread created · {item.task}</Text><Text style={[styles.taskConfirmationText, { color: colors.accentForeground }]}>{item.taskDetails}</Text></View></View>}</View></View>} scrollEnabled={messages.length > 0} showsVerticalScrollIndicator={false} />
       <View style={[styles.suggestions, { borderTopColor: colors.border }]}><Text style={[styles.suggestionLabel, { color: colors.mutedForeground }]}>TRY ASKING</Text><View style={styles.suggestionRow}><Pressable disabled={isReadOnly} onPress={() => respond('Please give Jordan the opening safety walk')} style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border, opacity: isReadOnly ? .5 : 1 }]}><Text style={[styles.suggestionText, { color: colors.foreground }]}>Assign a checklist</Text></Pressable><Pressable onPress={() => respond('What work is still outstanding?')} style={[styles.suggestion, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.suggestionText, { color: colors.foreground }]}>Check pending tasks</Text></Pressable></View></View>
        <View style={[styles.composer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) }]}><Pressable testID="voice-command" onPress={handleVoice} disabled={(!voiceSupported && !listening) || isReadOnly} style={[styles.mic, { backgroundColor: listening ? colors.primary : colors.secondary, opacity: !voiceSupported || isReadOnly ? .5 : 1 }]}><Feather name={listening ? 'square' : 'mic'} color={listening ? '#fff' : colors.foreground} size={18} /></Pressable><TextInput testID="ai-input" value={draft} onChangeText={setDraft} onSubmitEditing={() => respond(draft)} returnKeyType="send" placeholder={isReadOnly ? 'Viewer profile is read-only' : busy ? 'Thinking…' : listening ? 'Recording… tap mic to transcribe' : 'Ask ausease to do something…'} editable={!busy && !isReadOnly} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, opacity: isReadOnly ? .6 : 1 }]} /><Pressable testID="ai-send" onPress={() => respond(draft)} disabled={busy || isReadOnly} style={({ pressed }) => [styles.send, { backgroundColor: colors.primary, opacity: pressed || busy || isReadOnly ? .5 : 1 }]}><Feather name="arrow-up" color="#fff" size={19} /></Pressable></View>
    </Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  aiEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 }, aiDot: { width: 7, height: 7, borderRadius: 4 }, eyebrow: { fontFamily: 'SpaceMono_700Bold', fontSize: 10, letterSpacing: 1.1 }, title: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 31, letterSpacing: -0.8 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 7 }, aiBadgeText: { fontFamily: 'SpaceMono_700Bold', fontSize: 8, letterSpacing: .8 },
  scope: { borderRadius: 5, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 11, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#DDF561' }, scopeText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
   list: { flex: 1 }, listContent: { paddingBottom: 10 }, messageLine: { flexDirection: 'row', gap: 9, marginVertical: 6, maxWidth: '93%' }, userLine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' }, avatar: { width: 31, height: 31, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, bubble: { borderRadius: 5, borderWidth: 1, borderRightWidth: 2, borderBottomWidth: 2, padding: 12, flexShrink: 1 }, message: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 }, taskConfirmation: { borderRadius: 5, padding: 8, flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10 }, taskConfirmationText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 }, confirmButton: { borderRadius: 5, padding: 10, marginTop: 10, alignItems: 'center' }, confirmText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  suggestions: { borderTopWidth: 1, paddingTop: 10, marginTop: 4 }, suggestionLabel: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, letterSpacing: 1, marginBottom: 8 }, suggestionRow: { flexDirection: 'row', gap: 8 }, suggestion: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 }, suggestionText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 10 }, mic: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, minHeight: 42, borderRadius: 10, borderWidth: 1, paddingHorizontal: 13, fontFamily: 'Inter_400Regular', fontSize: 13 }, send: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
