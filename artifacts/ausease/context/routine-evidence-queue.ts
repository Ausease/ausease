export const pendingRoutineEvidenceKey = 'ausease_pending_routine_evidence';

export function getPendingRoutineEvidenceKey(userId: string, storeId: string): string {
  return `${pendingRoutineEvidenceKey}:${encodeURIComponent(userId)}:${encodeURIComponent(storeId)}`;
}

export type PendingRoutineEvidence = {
  routineId: string;
  uri: string;
  /**
   * Set when the photo was uploaded and registered before completion failed.
   * Retries can then complete the routine without registering duplicate evidence.
   */
  evidenceId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

type EvidenceQueueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export class RoutineEvidenceUnavailableError extends Error {
  readonly code = 'ROUTINE_EVIDENCE_UNAVAILABLE';

  constructor(message = 'The local evidence file is no longer available.') {
    super(message);
    this.name = 'RoutineEvidenceUnavailableError';
  }
}

export function isPermanentlyUnavailableEvidenceError(error: unknown): boolean {
  if (error instanceof RoutineEvidenceUnavailableError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code.toUpperCase() : '';
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  return code === 'ENOENT'
    || code === 'EISDIR'
    || code === 'ROUTINE_EVIDENCE_UNAVAILABLE'
    || candidate.name === 'FileNotFoundError'
    || message.includes('no such file')
    || message.includes('file does not exist')
    || message.includes('file not found');
}

export type FlushResult = {
  attempted: number;
  uploaded: number;
  unavailable: PendingRoutineEvidence[];
  remaining: PendingRoutineEvidence[];
};
const activeFlushes = new Map<string, Promise<FlushResult>>();
let queueTail = Promise.resolve();

function runQueueExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueTail.then(operation);
  queueTail = next.then(() => undefined, () => undefined);
  return next;
}

export async function queuePendingRoutineEvidence(
  storage: EvidenceQueueStorage,
  evidence: PendingRoutineEvidence,
  storageKey = pendingRoutineEvidenceKey,
): Promise<void> {
  return runQueueExclusive(async () => {
    const raw = await storage.getItem(storageKey);
    const pending: PendingRoutineEvidence[] = raw ? JSON.parse(raw) : [];
    const alreadyQueued = pending.some(
      (item) => item.routineId === evidence.routineId && item.uri === evidence.uri,
    );
    if (!alreadyQueued) pending.push(evidence);
    await storage.setItem(storageKey, JSON.stringify(pending));
  });
}


export function flushPendingRoutineEvidence(
  storage: EvidenceQueueStorage,
  upload: (evidence: PendingRoutineEvidence) => Promise<void>,
  storageKey = pendingRoutineEvidenceKey,
): Promise<FlushResult> {
  const activeFlush = activeFlushes.get(storageKey);
  if (activeFlush) return activeFlush;
  const nextFlush = runQueueExclusive(async () => {
    const raw = await storage.getItem(storageKey);
    if (!raw) return { attempted: 0, uploaded: 0, unavailable: [], remaining: [] };

    const pending = JSON.parse(raw) as PendingRoutineEvidence[];
    const unavailable: PendingRoutineEvidence[] = [];
    const remaining: PendingRoutineEvidence[] = [];
    for (const evidence of pending) {
      try {
        await upload(evidence);
      } catch (error) {
        if (isPermanentlyUnavailableEvidenceError(error)) {
          unavailable.push(evidence);
        } else {
          remaining.push(evidence);
        }
      }
    }
    await storage.setItem(storageKey, JSON.stringify(remaining));
    return {
      attempted: pending.length,
      uploaded: pending.length - remaining.length - unavailable.length,
      unavailable,
      remaining,
    };
  });
  activeFlushes.set(storageKey, nextFlush);
  void nextFlush.then(
    () => { if (activeFlushes.get(storageKey) === nextFlush) activeFlushes.delete(storageKey); },
    () => { if (activeFlushes.get(storageKey) === nextFlush) activeFlushes.delete(storageKey); },
  );
  return nextFlush;
}