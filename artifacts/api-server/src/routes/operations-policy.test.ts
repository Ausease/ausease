import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { db, auditEventsTable, operationsRecordsTable, organizationsTable, storesTable } from "@workspace/db";
import { writeAuditEvent } from "../lib/audit";
import { acceptedOperationAudit, decideOperationMutation, operationAuditMetadata } from "./operations-policy";
import { persistOperationMutation } from "./operations-persistence";

const current = {
  id: "task-1",
  version: 3,
  mutationId: "mutation-old",
  payload: { title: "Current title" },
};

test("same-record edits reject a stale version without losing the server record", () => {
  const decision = decideOperationMutation(current, {
    payload: { title: "Offline title" },
    expectedVersion: 2,
    mutationId: "mutation-new",
  });
  assert.deepEqual(decision, { kind: "conflict" });
  assert.deepEqual(current.payload, { title: "Current title" });
  assert.equal(current.version, 3);
});

test("a repeated mutation is accepted idempotently and does not increment version", () => {
  const mutation = { payload: { title: "Saved title" }, expectedVersion: 3, mutationId: "mutation-old" };
  assert.deepEqual(decideOperationMutation(current, mutation), { kind: "idempotent" });
  assert.deepEqual(decideOperationMutation(undefined, { ...mutation, expectedVersion: undefined }), {
    kind: "accepted",
    nextVersion: 1,
  });
});

test("accepted operation audit metadata keeps source and mutation identity", () => {
  assert.deepEqual(operationAuditMetadata(" offline_queue ", "mutation-1", 4), {
    source: "offline_queue",
    mutationId: "mutation-1",
    version: 4,
  });
  assert.deepEqual(operationAuditMetadata(undefined, null, 1), {
    source: "mobile",
    mutationId: null,
    version: 1,
  });
  assert.deepEqual(acceptedOperationAudit("user-42", "manager", "offline_queue", "mutation-1", 4), {
    actorClerkUserId: "user-42",
    actorRole: "manager",
    metadata: { source: "offline_queue", mutationId: "mutation-1", version: 4 },
  });
});

test("a failed operation audit rolls back the operation change", async () => {
  const organizationId = `rollback-org-${Date.now()}`;
  const storeId = `rollback-store-${Date.now()}`;
  const recordId = `rollback-record-${Date.now()}`;
  const auditScope = and(eq(auditEventsTable.organizationId, organizationId), eq(auditEventsTable.storeId, storeId));
  const context = { userId: "rollback-user", organizationId, storeId, role: "manager" as const };

  try {
    await db.insert(organizationsTable).values({ id: organizationId, name: "Rollback test organization" });
    await db.insert(storesTable).values({ id: storeId, organizationId, name: "Rollback test store" });
    await db.insert(operationsRecordsTable).values({
      id: recordId,
      organizationId,
      storeId,
      kind: "task",
      payload: { title: "Before failed audit" },
      version: 1,
      mutationId: null,
      createdBy: "seed",
    });

    const failingAuditWriter: typeof writeAuditEvent = async () => {
      throw new Error("simulated audit database failure");
    };

    await assert.rejects(
      persistOperationMutation(context, {
        kind: "task",
        recordId,
        payload: { title: "Must not be saved" },
        expectedVersion: 1,
        mutationId: "rollback-mutation",
        source: "rollback_test",
      }, failingAuditWriter),
      /simulated audit database failure/,
    );

    const [saved] = await db.select().from(operationsRecordsTable).where(eq(operationsRecordsTable.id, recordId));
    assert.deepEqual(saved.payload, { title: "Before failed audit" });
    assert.equal(saved.version, 1);
    assert.equal(saved.mutationId, null);
    const audits = await db.select().from(auditEventsTable).where(auditScope);
    assert.equal(audits.length, 0);
  } finally {
    await db.delete(auditEventsTable).where(auditScope);
    await db.delete(operationsRecordsTable).where(eq(operationsRecordsTable.id, recordId));
    await db.delete(storesTable).where(eq(storesTable.id, storeId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
  }
});

test("live PostgreSQL compare-and-swap accepts one concurrent device edit and audits it once", async () => {
  const organizationId = `concurrency-org-${Date.now()}`;
  const storeId = `concurrency-store-${Date.now()}`;
  const recordId = `concurrency-record-${Date.now()}`;
  const auditScope = and(eq(auditEventsTable.organizationId, organizationId), eq(auditEventsTable.storeId, storeId));
  const recordScope = and(eq(operationsRecordsTable.organizationId, organizationId), eq(operationsRecordsTable.storeId, storeId));
  const contextA = { userId: "device-user-a", organizationId, storeId, role: "manager" as const };
  const contextB = { userId: "device-user-b", organizationId, storeId, role: "manager" as const };

  try {
    await db.insert(organizationsTable).values({ id: organizationId, name: "Concurrency test organization" });
    await db.insert(storesTable).values({ id: storeId, organizationId, name: "Concurrency test store" });
    await db.insert(operationsRecordsTable).values({
        id: recordId,
        organizationId,
        storeId,
        kind: "task",
        payload: { title: "Original task" },
        version: 1,
        mutationId: null,
        createdBy: "seed",
      });

    const [first, second] = await Promise.all([
      persistOperationMutation(contextA, {
        kind: "task",
        recordId,
        payload: { title: "Device A task" },
        expectedVersion: 1,
        mutationId: "mutation-device-a",
        source: "device_a",
      }),
      persistOperationMutation(contextB, {
        kind: "task",
        recordId,
        payload: { title: "Device B task" },
        expectedVersion: 1,
        mutationId: "mutation-device-b",
        source: "device_b",
      }),
    ]);

    assert.equal([first.kind, second.kind].filter((kind) => kind === "accepted").length, 1);
    assert.equal([first.kind, second.kind].filter((kind) => kind === "conflict").length, 1);

    const [saved] = await db.select().from(operationsRecordsTable).where(eq(operationsRecordsTable.id, recordId));
    assert.equal(saved.version, 2);
    assert.match(saved.createdBy, /^device-user-[ab]$/);

    const acceptedMutationId = saved.mutationId;
    assert.ok(acceptedMutationId);
    const acceptedSource = saved.createdBy === contextA.userId ? "device_a" : "device_b";
    const repeat = await persistOperationMutation(
      saved.createdBy === contextA.userId ? contextA : contextB,
      {
        kind: "task",
        recordId,
        payload: saved.payload,
        expectedVersion: 1,
        mutationId: acceptedMutationId,
        source: acceptedSource,
      },
    );
    assert.equal(repeat.kind, "idempotent");

    const [audit] = await db.select().from(auditEventsTable).where(and(
      auditScope,
      eq(auditEventsTable.action, "operations.record_saved"),
      eq(auditEventsTable.resourceId, recordId),
    ));
    assert.ok(audit);
    assert.equal(audit.actorClerkUserId, saved.createdBy);
    assert.equal((audit.metadata as Record<string, unknown>).source, acceptedSource);
    assert.equal((audit.metadata as Record<string, unknown>).mutationId, acceptedMutationId);

    const audits = await db.select().from(auditEventsTable).where(and(
      auditScope,
      eq(auditEventsTable.action, "operations.record_saved"),
      eq(auditEventsTable.resourceId, recordId),
    ));
    assert.equal(audits.length, 1);
  } finally {
    await db.delete(auditEventsTable).where(auditScope);
    await db.delete(operationsRecordsTable).where(recordScope);
    await db.delete(storesTable).where(eq(storesTable.id, storeId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
  }
});

test("live PostgreSQL operation pressure preserves every accepted edit and audit", async () => {
  // Keep this below the test database pool size while still creating sustained
  // pressure: each worker performs several read/CAS-update/audit cycles.
  const concurrencyLimit = 8;
  const editsPerWorker = 6;
  const expectedAcceptedEdits = concurrencyLimit * editsPerWorker;
  const organizationId = `pressure-org-${Date.now()}`;
  const storeId = `pressure-store-${Date.now()}`;
  const recordId = `pressure-record-${Date.now()}`;
  const auditScope = and(eq(auditEventsTable.organizationId, organizationId), eq(auditEventsTable.storeId, storeId));
  const recordScope = and(eq(operationsRecordsTable.organizationId, organizationId), eq(operationsRecordsTable.storeId, storeId));

  try {
    await db.insert(organizationsTable).values({ id: organizationId, name: "Operation pressure test organization" });
    await db.insert(storesTable).values({ id: storeId, organizationId, name: "Operation pressure test store" });
    await db.insert(operationsRecordsTable).values({
      id: recordId,
      organizationId,
      storeId,
      kind: "task",
      payload: { title: "Pressure test original task" },
      version: 1,
      mutationId: null,
      createdBy: "pressure-test-seed",
    });

    const workerResults = await Promise.all(
      Array.from({ length: concurrencyLimit }, async (_, workerIndex) => {
        const context = {
          userId: `pressure-device-${workerIndex}`,
          organizationId,
          storeId,
          role: "manager" as const,
        };
        const accepted: Array<{ mutationId: string; version: number }> = [];

        for (let editIndex = 0; editIndex < editsPerWorker; editIndex += 1) {
          const mutationId = `pressure-mutation-${workerIndex}-${editIndex}`;
          let completed = false;

          // Conflicts are expected under load; retrying makes every worker
          // contribute a committed edit while preserving CAS correctness.
          for (let attempt = 0; attempt < expectedAcceptedEdits * 2 && !completed; attempt += 1) {
            const [current] = await db.select().from(operationsRecordsTable).where(eq(operationsRecordsTable.id, recordId));
            const result = await persistOperationMutation(context, {
              kind: "task",
              recordId,
              payload: { title: `Pressure edit ${mutationId}` },
              expectedVersion: current.version,
              mutationId,
              source: "pressure_test",
            });

            if (result.kind === "accepted") {
              accepted.push({ mutationId, version: result.record.version });
              completed = true;
            } else if (result.kind === "idempotent") {
              throw new Error(`pressure mutation ${mutationId} became idempotent before completion`);
            }
          }

          if (!completed) {
            throw new Error(`pressure mutation ${mutationId} exceeded CAS retry budget`);
          }
        }

        return accepted;
      }),
    ).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `operation pressure test failed at concurrency limit ${concurrencyLimit} (${expectedAcceptedEdits} edits): ` +
        `check PostgreSQL pool capacity and transaction errors; ${detail}`,
        { cause: error },
      );
    });

    const accepted = workerResults.flat();
    assert.equal(accepted.length, expectedAcceptedEdits, "every pressure edit should be accepted exactly once");
    assert.equal(new Set(accepted.map(({ mutationId }) => mutationId)).size, expectedAcceptedEdits);
    assert.deepEqual(
      accepted.map(({ version }) => version).sort((a, b) => a - b),
      Array.from({ length: expectedAcceptedEdits }, (_, index) => index + 2),
      "accepted versions must be contiguous so no update was silently lost",
    );

    const [saved] = await db.select().from(operationsRecordsTable).where(eq(operationsRecordsTable.id, recordId));
    assert.equal(saved.version, expectedAcceptedEdits + 1);
    assert.ok(saved.mutationId);
    assert.equal(new Set(accepted.map(({ mutationId }) => mutationId)).has(saved.mutationId), true);

    const audits = await db.select().from(auditEventsTable).where(and(
      auditScope,
      eq(auditEventsTable.action, "operations.record_saved"),
      eq(auditEventsTable.resourceId, recordId),
    ));
    assert.equal(audits.length, expectedAcceptedEdits, "each accepted edit must have exactly one audit event");
    const auditedMutationIds = audits.map((audit) => (audit.metadata as Record<string, unknown>).mutationId);
    assert.equal(new Set(auditedMutationIds).size, expectedAcceptedEdits);
    assert.deepEqual(
      new Set(auditedMutationIds),
      new Set(accepted.map(({ mutationId }) => mutationId)),
      "audit events must match the accepted edits",
    );
  } finally {
    await db.delete(auditEventsTable).where(auditScope);
    await db.delete(operationsRecordsTable).where(recordScope);
    await db.delete(storesTable).where(eq(storesTable.id, storeId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
  }
});