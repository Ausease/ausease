import { and, eq, sql } from "drizzle-orm";
import { db, operationsRecordsTable } from "@workspace/db";
import type { EnterpriseContext } from "../middleware/auth";
import { writeAuditEvent } from "../lib/audit";
import { decideOperationMutation, operationAuditMetadata } from "./operations-policy";

export type PersistOperationInput = {
  kind: "task" | "issue" | "message";
  recordId: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  mutationId: string | null;
  source?: string;
};

export type PersistOperationResult =
  | { kind: "accepted"; record: typeof operationsRecordsTable.$inferSelect }
  | { kind: "idempotent"; record: typeof operationsRecordsTable.$inferSelect }
  | { kind: "conflict"; current?: typeof operationsRecordsTable.$inferSelect };

export async function persistOperationMutation(
  context: EnterpriseContext,
  input: PersistOperationInput,
  auditWriter: typeof writeAuditEvent = writeAuditEvent,
): Promise<PersistOperationResult> {
  return db.transaction(async (transaction) => {
    const existing = await transaction.select().from(operationsRecordsTable).where(and(
      eq(operationsRecordsTable.id, input.recordId),
      eq(operationsRecordsTable.organizationId, context.organizationId),
      eq(operationsRecordsTable.storeId, context.storeId),
      eq(operationsRecordsTable.kind, input.kind),
    )).limit(1);
    const current = existing[0];
    const decision = decideOperationMutation(current, {
      payload: input.payload,
      expectedVersion: input.expectedVersion,
      mutationId: input.mutationId,
    });

    if (decision.kind === "idempotent") return { kind: "idempotent", record: current };
    if (decision.kind === "conflict") return { kind: "conflict", current };

    let saved: typeof operationsRecordsTable.$inferSelect | undefined;
    if (current) {
      [saved] = await transaction.update(operationsRecordsTable).set({
        payload: input.payload,
        version: sql`${operationsRecordsTable.version} + 1`,
        mutationId: input.mutationId,
        updatedAt: new Date(),
        createdBy: context.userId,
      }).where(and(
        eq(operationsRecordsTable.id, input.recordId),
        eq(operationsRecordsTable.organizationId, context.organizationId),
        eq(operationsRecordsTable.storeId, context.storeId),
        eq(operationsRecordsTable.kind, input.kind),
        eq(operationsRecordsTable.version, current.version),
      )).returning();
      if (!saved) return { kind: "conflict" };
    } else {
      [saved] = await transaction.insert(operationsRecordsTable).values({
        id: input.recordId,
        organizationId: context.organizationId,
        storeId: context.storeId,
        kind: input.kind,
        payload: input.payload,
        version: 1,
        mutationId: input.mutationId,
        createdBy: context.userId,
      }).returning();
    }

    await auditWriter(context, "operations.record_saved", input.kind, input.recordId, {
      ...operationAuditMetadata(input.source, input.mutationId, saved.version),
    }, transaction);
    return { kind: "accepted", record: saved };
  });
}