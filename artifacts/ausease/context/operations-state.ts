export type OperationsState<TTask, TIssue, TMessage> = {
  tasks: TTask[];
  issues: TIssue[];
  messages: TMessage[];
};

export type QueuedMutation = {
  kind: "task" | "issue" | "message";
  id: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  mutationId: string;
};

export type OperationConflictState = {
  kind: QueuedMutation["kind"];
  id: string;
  local: Record<string, unknown>;
  current?: unknown;
};

export function resetOperationsState<TTask, TIssue, TMessage>(
  starter: OperationsState<TTask, TIssue, TMessage>,
): OperationsState<TTask, TIssue, TMessage> {
  return {
    tasks: [...starter.tasks],
    issues: [...starter.issues],
    messages: [...starter.messages],
  };
}

export function shouldPersistOperations(isSignedIn: boolean, hydrated: boolean): boolean {
  return isSignedIn && hydrated;
}

export function enqueueOperation(queue: QueuedMutation[], mutation: QueuedMutation): QueuedMutation[] {
  const prior = queue.find((item) => item.kind === mutation.kind && item.id === mutation.id);
  return [
    ...queue.filter((item) => !(item.kind === mutation.kind && item.id === mutation.id)),
    { ...mutation, expectedVersion: prior?.expectedVersion ?? mutation.expectedVersion },
  ];
}

export type ReplayResult = {
  remaining: QueuedMutation[];
  conflicts: OperationConflictState[];
};

export async function replayOperations(
  queue: QueuedMutation[],
  send: (mutation: QueuedMutation) => Promise<unknown>,
): Promise<ReplayResult> {
  const remaining: QueuedMutation[] = [];
  const conflicts: OperationConflictState[] = [];
  for (const mutation of queue) {
    try {
      await send(mutation);
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 409) {
        conflicts.push({ kind: mutation.kind, id: mutation.id, local: mutation.payload, current: (error as { data?: unknown }).data });
      } else {
        remaining.push(mutation);
      }
    }
  }
  return { remaining, conflicts };
}

export function resolveOperationConflict(
  conflict: OperationConflictState,
  useServer: boolean,
  nextMutationId: string,
): { serverPayload?: Record<string, unknown>; retry?: QueuedMutation } {
  const serverRecord = (conflict.current as { current?: { payload?: Record<string, unknown>; version?: number } } | undefined)?.current;
  if (useServer && serverRecord?.payload) return { serverPayload: serverRecord.payload };
  if (!useServer) {
    return {
      retry: {
        kind: conflict.kind,
        id: conflict.id,
        payload: conflict.local,
        expectedVersion: serverRecord?.version,
        mutationId: nextMutationId,
      },
    };
  }
  return {};
}