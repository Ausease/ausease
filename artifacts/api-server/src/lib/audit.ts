import { db, auditEventsTable } from "@workspace/db";
import type { EnterpriseContext } from "../middleware/auth";

type AuditDatabase = Pick<typeof db, "insert">;

export async function writeAuditEvent(
  context: EnterpriseContext,
  action: string,
  resourceType: string,
  resourceId: string | undefined,
  metadata: Record<string, unknown> = {},
  database: AuditDatabase = db,
) {
  await database.insert(auditEventsTable).values({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    organizationId: context.organizationId,
    storeId: context.storeId,
    actorClerkUserId: context.userId,
    actorRole: context.role,
    action,
    resourceType,
    resourceId,
    metadata,
  });
}