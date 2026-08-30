import type { EnterpriseRole } from "./auth-types";

export type MembershipStatus = "active" | "invited" | "disabled" | string | undefined;

type InvitationMembership = {
  id: string;
  clerkUserId: string;
  email: string | null;
  organizationId: string;
  storeId: string;
  status: string;
};

export function invitationActivationTarget(
  memberships: InvitationMembership[],
  userId: string,
  email: string | undefined,
  tenant: { organizationId?: string; storeId?: string },
): string | undefined {
  const knownMembership = memberships.find((membership) =>
    membership.clerkUserId === userId && membership.status === "invited");
  if (knownMembership) return knownMembership.id;

  // If the verified identity carries tenant keys, require both keys to match.
  // When an invite is the only pending membership for that verified email,
  // it is also safe to activate it without waiting for claims to refresh.
  // Never choose between multiple tenants from an email-only match.
  if (!email) return undefined;
  const pendingForEmail = memberships.filter((membership) =>
    membership.email?.toLowerCase() === email &&
    membership.status === "invited" &&
    membership.clerkUserId.startsWith("pending:"));
  if (!tenant.organizationId || !tenant.storeId) {
    return pendingForEmail.length === 1 ? pendingForEmail[0].id : undefined;
  }
  return memberships.find((membership) =>
    membership.email?.toLowerCase() === email &&
    membership.status === "invited" &&
    membership.clerkUserId.startsWith("pending:") &&
    membership.organizationId === tenant.organizationId &&
    membership.storeId === tenant.storeId,
  )?.id;
}

export function isActiveMembership(status: MembershipStatus): boolean {
  return status === "active";
}

export function canPerformRole(role: EnterpriseRole | undefined, allowed: EnterpriseRole[]): boolean {
  return role !== undefined && allowed.includes(role);
}

export function isSameStoreScope(
  context: { organizationId: string; storeId: string },
  resource: { organizationId: string; storeId: string },
): boolean {
  return context.organizationId === resource.organizationId && context.storeId === resource.storeId;
}