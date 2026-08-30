export type OperationRecordLike = {
  id: string;
  version: number;
  mutationId: string | null;
  payload: Record<string, unknown>;
};

export type OperationMutation = {
  payload: Record<string, unknown>;
  expectedVersion?: number;
  mutationId: string | null;
};

export type OperationDecision =
  | { kind: "accepted"; nextVersion: number }
  | { kind: "idempotent" }
  | { kind: "conflict" };

/**
 * Decide a mutation before touching the database. The database update still
 * uses the version predicate because two requests can pass this check together.
 */
export function decideOperationMutation(
  existing: OperationRecordLike | undefined,
  mutation: OperationMutation,
): OperationDecision {
  if (existing?.mutationId && mutation.mutationId && existing.mutationId === mutation.mutationId) {
    return { kind: "idempotent" };
  }
  if (existing && mutation.expectedVersion !== undefined && existing.version !== mutation.expectedVersion) {
    return { kind: "conflict" };
  }
  return { kind: "accepted", nextVersion: existing ? existing.version + 1 : 1 };
}

export function operationAuditMetadata(
  source: string | undefined,
  mutationId: string | null,
  version: number,
) {
  return {
    source: source?.trim() || "mobile",
    mutationId,
    version,
  };
}

export function acceptedOperationAudit(
  actorClerkUserId: string,
  actorRole: string,
  source: string | undefined,
  mutationId: string | null,
  version: number,
) {
  return {
    actorClerkUserId,
    actorRole,
    metadata: operationAuditMetadata(source, mutationId, version),
  };
}