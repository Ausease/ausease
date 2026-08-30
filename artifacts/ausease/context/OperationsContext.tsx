import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { getOperationsSnapshot, updateOperationsRecord } from '@workspace/api-client-react';
import { enqueueOperation, replayOperations, resetOperationsState, resolveOperationConflict, shouldPersistOperations, type QueuedMutation } from './operations-state';
import { useDemo } from './DemoContext';

export type Task = { id: string; title: string; area: string; due: string; done: boolean; priority?: 'high' | 'normal'; assignee?: string; version?: number };
export type Issue = { id: string; title: string; area: string; status: 'Open' | 'In progress' | 'Resolved'; time: string; urgent?: boolean; version?: number };
export type ChatMessage = { id: string; author: string; text: string; time: string; mine?: boolean; version?: number };
type OperationKind = 'task' | 'issue' | 'message';
export type OperationConflict = { kind: OperationKind; id: string; local: Record<string, unknown>; current?: unknown };

const starterTasks: Task[] = [
  { id: '1', title: 'Complete opening safety walk', area: 'Store floor', due: 'Due 9:30 am', done: false, priority: 'high' },
  { id: '2', title: 'Check promotional displays', area: 'Front of store', due: 'Due today', done: false },
  { id: '3', title: 'Count high-value stock', area: 'Stockroom', due: 'Due today', done: true },
  { id: '4', title: 'Upload closing photos', area: 'Store floor', due: 'Due 6:00 pm', done: false },
];
const starterIssues: Issue[] = [
  { id: '1', title: 'Freezer temperature is rising', area: 'Back of house', status: 'In progress', time: '12 min ago', urgent: true },
  { id: '2', title: 'Light out above fitting rooms', area: 'Customer area', status: 'Open', time: '48 min ago' },
  { id: '3', title: 'Delivery arrived at dock', area: 'Goods in', status: 'Resolved', time: 'Yesterday' },
];
const starterMessages: ChatMessage[] = [
  { id: '1', author: 'Mia Chen', text: 'Morning team — the new display guide is in the tasks tab.', time: '8:42 am' },
  { id: '2', author: 'You', text: 'Got it. I’ll take the front of store checks.', time: '8:45 am', mine: true },
  { id: '3', author: 'Jordan Lee', text: 'Freezer issue has been raised with maintenance.', time: '9:02 am' },
];

type OperationsContextValue = {
  tasks: Task[];
  issues: Issue[];
  messages: ChatMessage[];
  toggleTask: (id: string) => void;
  addIssue: (title: string, area: string) => void;
  addTask: (title: string, assignee?: string, details?: Partial<Pick<Task, 'area' | 'due' | 'priority'>>) => void;
  addMessage: (text: string) => void;
  conflicts: OperationConflict[];
  resolveConflict: (kind: OperationKind, id: string, useServer: boolean) => void;
};
const OperationsContext = createContext<OperationsContextValue | null>(null);

export function OperationsProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const { isDemoMode, profileKey, data: demoData } = useDemo();
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  const [issues, setIssues] = useState<Issue[]>(starterIssues);
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [conflicts, setConflicts] = useState<OperationConflict[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const queueKey = 'ausease_operations_queue';

  const enqueue = async (mutation: QueuedMutation) => {
    const raw = await AsyncStorage.getItem(queueKey);
    const queue: QueuedMutation[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(queueKey, JSON.stringify(enqueueOperation(queue, mutation)));
  };
  const flushQueue = async () => {
    const raw = await AsyncStorage.getItem(queueKey);
    const queue: QueuedMutation[] = raw ? JSON.parse(raw) : [];
    const result = await replayOperations(queue, async (mutation) => {
        const saved = await updateOperationsRecord(mutation.kind, mutation.id, {
          payload: mutation.payload,
          expectedVersion: mutation.expectedVersion,
          mutationId: mutation.mutationId,
          source: 'offline_queue',
        });
        const applyVersion = <T extends { id: string; version?: number }>(items: T[]) =>
          items.map((item) => item.id === mutation.id ? { ...item, version: saved.version } : item);
        if (mutation.kind === 'task') setTasks(applyVersion);
        if (mutation.kind === 'issue') setIssues(applyVersion);
        if (mutation.kind === 'message') setMessages(applyVersion);
    });
    await AsyncStorage.setItem(queueKey, JSON.stringify(result.remaining));
    if (result.conflicts.length) setConflicts((current) => [
      ...current.filter((item) => !result.conflicts.some((conflict) => conflict.kind === item.kind && conflict.id === item.id)),
      ...result.conflicts,
    ]);
  };

  useEffect(() => {
    if (isDemoMode) {
      setTasks(demoData.tasks.map((task) => ({ ...task })));
      setIssues(demoData.issues.map((issue) => ({ ...issue })));
      setMessages(demoData.messages.map((message) => ({ ...message })));
      setConflicts([]);
      setHydrated(true);
      return;
    }
    if (!isSignedIn) {
      // Do not leave one account's operational data visible while signed out.
      const reset = resetOperationsState({ tasks: starterTasks, issues: starterIssues, messages: starterMessages });
      setTasks(reset.tasks);
      setIssues(reset.issues);
      setMessages(reset.messages);
      setHydrated(true);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const snapshot = await getOperationsSnapshot();
        if (active && (snapshot.tasks.length || snapshot.issues.length || snapshot.messages.length)) {
          setTasks(snapshot.tasks as Task[]);
          setIssues(snapshot.issues as Issue[]);
          setMessages(snapshot.messages as ChatMessage[]);
          setHydrated(true);
          return;
        }
      } catch {
        // Offline or not yet provisioned: restore the local encrypted-device fallback.
      }
      const [t, i, m] = await Promise.all(['tasks', 'issues', 'messages'].map((key) => AsyncStorage.getItem(`ausease_${key}`)));
      if (!active) return;
       if (t) setTasks(JSON.parse(t));
      if (i) setIssues(JSON.parse(i));
      if (m) setMessages(JSON.parse(m));
      setHydrated(true);
    };
    void load();
    return () => { active = false; };
  }, [demoData, isDemoMode, isSignedIn, profileKey]);
  useEffect(() => {
    if (isDemoMode) return;
    if (!hydrated || !shouldPersistOperations(Boolean(isSignedIn), hydrated)) return;
    void AsyncStorage.setItem('ausease_tasks', JSON.stringify(tasks));
    void AsyncStorage.setItem('ausease_issues', JSON.stringify(issues));
    void AsyncStorage.setItem('ausease_messages', JSON.stringify(messages));
  }, [hydrated, isDemoMode, isSignedIn, tasks, issues, messages]);

  useEffect(() => {
    if (isDemoMode) return;
    if (hydrated && isSignedIn) void flushQueue();
  }, [hydrated, isDemoMode, isSignedIn]);

  const queueRecord = (kind: OperationKind, record: Record<string, unknown>, previousVersion?: number) => {
    const mutation: QueuedMutation = {
      kind, id: String(record.id), payload: record, expectedVersion: previousVersion,
      mutationId: `${kind}:${record.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    };
    void enqueue(mutation).then(flushQueue);
  };

  const value = useMemo(() => ({
    tasks, issues, messages,
    conflicts,
     toggleTask: (id: string) => setTasks((current) => {
      const task = current.find((item) => item.id === id);
      if (!task) return current;
      const next = { ...task, done: !task.done };
       if (!isDemoMode) queueRecord('task', next, task.version);
      return current.map((item) => item.id === id ? next : item);
    }),
    addTask: (title: string, assignee?: string, details: Partial<Pick<Task, 'area' | 'due' | 'priority'>> = {}) => {
      const task = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, assignee, area: details.area ?? 'Store operations', due: details.due ?? 'Due today', priority: details.priority ?? 'normal', done: false };
       setTasks((current) => [task, ...current]); if (!isDemoMode) queueRecord('task', task);
    },
    addIssue: (title: string, area: string) => {
      const issue = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, area, status: 'Open' as const, time: 'Just now' };
       setIssues((current) => [issue, ...current]); if (!isDemoMode) queueRecord('issue', issue);
    },
    addMessage: (text: string) => {
      const message = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, author: 'You', text, time: 'Just now', mine: true };
       setMessages((current) => [...current, message]); if (!isDemoMode) queueRecord('message', message);
    },
    resolveConflict: (kind: OperationKind, id: string, useServer: boolean) => {
      const conflict = conflicts.find((item) => item.kind === kind && item.id === id);
      if (!conflict) return;
       const resolution = resolveOperationConflict(conflict, useServer, `${kind}:${id}:conflict:${Date.now()}`);
       if (resolution.serverPayload) {
         const payload = resolution.serverPayload;
        if (kind === 'task') setTasks((current) => current.map((item) => item.id === id ? payload as Task : item));
        if (kind === 'issue') setIssues((current) => current.map((item) => item.id === id ? payload as Issue : item));
        if (kind === 'message') setMessages((current) => current.map((item) => item.id === id ? payload as ChatMessage : item));
      }
       if (resolution.retry) void enqueue(resolution.retry).then(flushQueue);
      setConflicts((current) => current.filter((item) => !(item.kind === kind && item.id === id)));
    },
  }), [conflicts, isDemoMode, issues, messages, tasks]);
  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}
export function useOperations() {
  const context = useContext(OperationsContext);
  if (!context) throw new Error('useOperations must be used inside OperationsProvider');
  return context;
}