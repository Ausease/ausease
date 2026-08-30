import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueOperation,
  replayOperations,
  resetOperationsState,
  resolveOperationConflict,
  shouldPersistOperations,
  type QueuedMutation,
} from "./operations-state";
import {
  flushPendingRoutineEvidence,
  getPendingRoutineEvidenceKey,
  pendingRoutineEvidenceKey,
  queuePendingRoutineEvidence,
  type PendingRoutineEvidence,
} from "./routine-evidence-queue";

test("signed-out smoke path resets workspace data to starter state", () => {
  const starter = { tasks: [{ id: "starter" }], issues: [], messages: [] };
  const reset = resetOperationsState(starter);
  assert.deepEqual(reset, starter);
  assert.notEqual(reset.tasks, starter.tasks);
  reset.tasks.push({ id: "local-only" });
  assert.equal(starter.tasks.length, 1);
});


test("workspace hydration persists only for an authenticated hydrated session", () => {
  assert.equal(shouldPersistOperations(false, true), false);
  assert.equal(shouldPersistOperations(true, false), false);
  assert.equal(shouldPersistOperations(true, true), true);
});

const mutation = (overrides: Partial<QueuedMutation> = {}): QueuedMutation => ({
  kind: "task",
  id: "task-1",
  payload: { id: "task-1", done: true },
  expectedVersion: 2,
  mutationId: "mutation-1",
  ...overrides,
});

test("offline queue persistence coalesces one record without losing its original version", () => {
  const first = enqueueOperation([], mutation());
  const updated = enqueueOperation(first, mutation({
    payload: { id: "task-1", done: false },
    expectedVersion: 3,
    mutationId: "mutation-2",
  }));
  assert.deepEqual(updated, [mutation({
    payload: { id: "task-1", done: false },
    expectedVersion: 2,
    mutationId: "mutation-2",
  })]);
});

test("reconnect replay removes accepted mutations but retains transient failures", async () => {
  const queue = [mutation(), mutation({ id: "task-2", mutationId: "mutation-2" })];
  const result = await replayOperations(queue, async (item) => {
    if (item.id === "task-2") throw new Error("offline");
  });
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.remaining, [queue[1]]);
});

test("reconnect replay surfaces version conflicts and keeps local edits recoverable", async () => {
  const local = mutation();
  const result = await replayOperations([local], async () => {
    throw {
      status: 409,
      data: { current: { payload: { id: "task-1", done: false }, version: 3 } },
    };
  });
  assert.equal(result.remaining.length, 0);
  assert.deepEqual(result.conflicts[0], {
    kind: "task",
    id: "task-1",
    local: local.payload,
    current: { current: { payload: { id: "task-1", done: false }, version: 3 } },
  });
  assert.deepEqual(resolveOperationConflict(result.conflicts[0], false, "mutation-retry"), {
    retry: mutation({
      expectedVersion: 3,
      mutationId: "mutation-retry",
    }),
  });
  assert.deepEqual(resolveOperationConflict(result.conflicts[0], true, "unused"), {
    serverPayload: { id: "task-1", done: false },
  });
});

test("queued routine evidence survives an app restart and retries only failed uploads", async () => {
  const storage = new Map<string, string>();
  const deviceStorage = {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  };
  const evidence: PendingRoutineEvidence = {
    routineId: "routine-1",
    uri: "file:///documents/routine-evidence.jpg",
    fileName: "closing-photo.jpg",
    mimeType: "image/jpeg",
  };

  // The first app instance loses connectivity after saving the photo.
  await queuePendingRoutineEvidence(deviceStorage, evidence);
  assert.deepEqual(JSON.parse(storage.get(pendingRoutineEvidenceKey)!), [evidence]);

  // A new app instance reads the persisted queue. One upload still fails offline.
  const attemptedAfterRestart: string[] = [];
  const firstRetry = await flushPendingRoutineEvidence(deviceStorage, async (item) => {
    attemptedAfterRestart.push(item.routineId);
    throw new Error("offline");
  });
  assert.deepEqual(attemptedAfterRestart, ["routine-1"]);
  assert.equal(firstRetry.uploaded, 0);
  assert.deepEqual(JSON.parse(storage.get(pendingRoutineEvidenceKey)!), [evidence]);

  // Connectivity returns: the queued upload succeeds and is removed.
  const successfulRetry = await flushPendingRoutineEvidence(deviceStorage, async (item) => {
    attemptedAfterRestart.push(item.routineId);
  });
  assert.deepEqual(attemptedAfterRestart, ["routine-1", "routine-1"]);
  assert.equal(successfulRetry.uploaded, 1);
  assert.deepEqual(successfulRetry.remaining, []);
  assert.deepEqual(JSON.parse(storage.get(pendingRoutineEvidenceKey)!), []);
});

test("unavailable local evidence is removed instead of retrying forever", async () => {
  const evidence: PendingRoutineEvidence = {
    routineId: "routine-missing",
    uri: "file:///documents/deleted-photo.jpg",
  };
  const storage = new Map<string, string>([[pendingRoutineEvidenceKey, JSON.stringify([evidence])]]);
  const deviceStorage = {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  };

  const firstRetry = await flushPendingRoutineEvidence(deviceStorage, async () => {
    throw { code: "ENOENT", message: "No such file or directory" };
  });

  assert.equal(firstRetry.attempted, 1);
  assert.equal(firstRetry.uploaded, 0);
  assert.deepEqual(firstRetry.unavailable, [evidence]);
  assert.deepEqual(firstRetry.remaining, []);
  assert.deepEqual(JSON.parse(storage.get(pendingRoutineEvidenceKey)!), []);
});

test("transient evidence upload failures remain queued for retry", async () => {
  const evidence: PendingRoutineEvidence = {
    routineId: "routine-offline",
    uri: "file:///documents/photo.jpg",
  };
  const storage = new Map<string, string>([[pendingRoutineEvidenceKey, JSON.stringify([evidence])]]);
  const deviceStorage = {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  };

  const retry = await flushPendingRoutineEvidence(deviceStorage, async () => {
    throw new Error("Network request failed");
  });

  assert.equal(retry.uploaded, 0);
  assert.deepEqual(retry.unavailable, []);
  assert.deepEqual(retry.remaining, [evidence]);
  assert.deepEqual(JSON.parse(storage.get(pendingRoutineEvidenceKey)!), [evidence]);
});

test("overlapping evidence flushes share one upload and one completion", async () => {
  const storage = new Map<string, string>([[pendingRoutineEvidenceKey, JSON.stringify([{
    routineId: "routine-overlap",
    uri: "file:///documents/routine-evidence.jpg",
  }])]]);
  const deviceStorage = {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  };
  let uploads = 0;
  let completions = 0;
  let releaseUpload!: () => void;
  const upload = async () => {
    uploads += 1;
    await new Promise<void>((resolve) => { releaseUpload = resolve; });
    completions += 1;
  };
  const first = flushPendingRoutineEvidence(deviceStorage, upload);
  const second = flushPendingRoutineEvidence(deviceStorage, upload);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  releaseUpload();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.uploaded, 1);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(uploads, 1);
  assert.equal(completions, 1);
  assert.deepEqual(JSON.parse(storage.get(pendingRoutineEvidenceKey)!), []);
});

test("overlapping evidence queue writes preserve every captured photo", async () => {
  const storage = new Map<string, string>();
  let reads = 0;
  const deviceStorage = {
    getItem: async (key: string) => {
      reads += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      return storage.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      storage.set(key, value);
    },
  };
  const first = { routineId: "routine-1", uri: "file:///documents/first.jpg" };
  const second = { routineId: "routine-1", uri: "file:///documents/second.jpg" };
  await Promise.all([
    queuePendingRoutineEvidence(deviceStorage, first),
    queuePendingRoutineEvidence(deviceStorage, second),
  ]);
  assert.equal(reads, 2);
  assert.deepEqual(JSON.parse(storage.get(pendingRoutineEvidenceKey)!), [first, second]);
});

test("repeated camera callbacks coalesce the same captured photo", async () => {
  const storage = new Map<string, string>();
  const deviceStorage = {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  };
  const first = {
    routineId: "routine-1",
    uri: "file:///documents/evidence.jpg",
    fileName: "evidence.jpg",
    mimeType: "image/jpeg",
  };
  const duplicate = { ...first, fileName: "duplicate-callback.jpg" };

  await Promise.all([
    queuePendingRoutineEvidence(deviceStorage, first),
    queuePendingRoutineEvidence(deviceStorage, duplicate),
  ]);

  assert.deepEqual(JSON.parse(storage.get(pendingRoutineEvidenceKey)!), [first]);
});

test("routine evidence queues use separate namespaces for different users and stores", async () => {
  const storage = new Map<string, string>();
  const deviceStorage = {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => { storage.set(key, value); },
  };
  const firstKey = getPendingRoutineEvidenceKey("user-a", "store-a");
  const secondKey = getPendingRoutineEvidenceKey("user-b", "store-b");
  const first = { routineId: "routine-1", uri: "file:///documents/first.jpg" };
  const second = { routineId: "routine-1", uri: "file:///documents/second.jpg" };

  await queuePendingRoutineEvidence(deviceStorage, first, firstKey);
  await queuePendingRoutineEvidence(deviceStorage, second, secondKey);

  assert.deepEqual(JSON.parse(storage.get(firstKey)!), [first]);
  assert.deepEqual(JSON.parse(storage.get(secondKey)!), [second]);
  assert.notEqual(firstKey, secondKey);
});
