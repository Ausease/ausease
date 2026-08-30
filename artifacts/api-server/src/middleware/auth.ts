import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { db, membershipsTable } from "@workspace/db";
import { canPerformRole, invitationActivationTarget, isActiveMembership } from "./authorization-policy";
import type { EnterpriseRole } from "./auth-types";

export type { EnterpriseRole } from "./auth-types";

export type EnterpriseContext = {
  userId: string;
  organizationId: string;
  storeId: string;
  role: EnterpriseRole;
  email?: string;
  membershipStatus?: "active" | "invited" | "disabled" | string;
};

declare global {
  namespace Express {
    interface Request {
      enterprise?: EnterpriseContext;
    }
  }
}

export const clerkAuthMiddleware = clerkMiddleware();

const validRoles = new Set<EnterpriseRole>(["employee", "manager", "reviewer", "hq_admin"]);
const claimString = (claims: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (typeof claims[key] === "string" && claims[key].trim()) return claims[key].trim();
  }
  return undefined;
};

const resolveVerifiedEmail = async (userId: string, claims: Record<string, unknown>) => {
  const claimEmail = claimString(claims, "email", "email_address");
  if (claimEmail) return claimEmail.toLowerCase();
  const metadata = (claims.publicMetadata ?? claims.public_metadata ?? {}) as Record<string, unknown>;
  const metadataEmail = claimString(metadata, "email");
  if (metadataEmail) return metadataEmail.toLowerCase();
  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress.toLowerCase();
};

const linkAcceptedInvitation = async (
  userId: string,
  claims: Record<string, unknown>,
  tenant: { organizationId?: string; storeId?: string },
) => {
  const tenantScope = tenant.organizationId && tenant.storeId
    ? [eq(membershipsTable.organizationId, tenant.organizationId), eq(membershipsTable.storeId, tenant.storeId)]
    : [];
  // Provisioning may have supplied a Clerk user ID already. In that case the
  // invitation still needs to transition from invited to active.
  const knownMembership = await db.select({ id: membershipsTable.id }).from(membershipsTable).where(and(
    eq(membershipsTable.clerkUserId, userId),
    eq(membershipsTable.status, "invited"),
    ...tenantScope,
  )).limit(1);
  if (knownMembership[0]) {
    await db.update(membershipsTable).set({ status: "active", updatedAt: new Date() })
      .where(and(
        eq(membershipsTable.id, knownMembership[0].id),
        eq(membershipsTable.status, "invited"),
        ...tenantScope,
      ));
    return;
  }
  const email = await resolveVerifiedEmail(userId, claims);
  if (!email) return;
  // The pending marker is deliberately required so an existing user's active
  // membership can never be replaced by an email-only match.
  if (!tenant.organizationId || !tenant.storeId) return;
  const pending = await db.select({
    id: membershipsTable.id,
    clerkUserId: membershipsTable.clerkUserId,
    email: membershipsTable.email,
    organizationId: membershipsTable.organizationId,
    storeId: membershipsTable.storeId,
    status: membershipsTable.status,
  }).from(membershipsTable).where(and(
    eq(membershipsTable.email, email),
    eq(membershipsTable.status, "invited"),
    eq(membershipsTable.organizationId, tenant.organizationId),
    eq(membershipsTable.storeId, tenant.storeId),
    sql`${membershipsTable.clerkUserId} like 'pending:%'`,
  )).limit(1);
  const pendingId = invitationActivationTarget(pending, userId, email, tenant);
  if (!pendingId) return;
  await db.update(membershipsTable).set({
    clerkUserId: userId,
    status: "active",
    updatedAt: new Date(),
  }).where(and(
    eq(membershipsTable.id, pendingId),
    eq(membershipsTable.status, "invited"),
    eq(membershipsTable.organizationId, tenant.organizationId),
    eq(membershipsTable.storeId, tenant.storeId),
    sql`${membershipsTable.clerkUserId} like 'pending:%'`,
  ));
};

export const requireEnterpriseAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  if (!userId) {
    res.status(401).json({ message: "Authentication is required." });
    return;
  }

  const claims = (auth.sessionClaims ?? {}) as Record<string, unknown>;
  const metadata = (claims.publicMetadata ?? claims.public_metadata ?? {}) as Record<string, unknown>;
  const claimedOrganizationId = claimString(claims, "org_id", "organization_id", "organizationId") ??
    claimString(metadata, "organizationId", "organization_id");
  const claimedStoreId = claimString(claims, "store_id", "storeId") ??
    claimString(metadata, "storeId", "store_id");
  try {
    await linkAcceptedInvitation(userId, claims, {
      organizationId: claimedOrganizationId,
      storeId: claimedStoreId,
    });
  } catch {
    res.status(503).json({
      code: "ENTERPRISE_ACCESS_UNAVAILABLE",
      message: "Your invitation could not be verified yet. Please try again.",
    });
    return;
  }
  const organizationId = claimedOrganizationId ??
    (process.env.NODE_ENV === "development" ? "demo-company" : undefined);
  const storeId = claimedStoreId ??
    (process.env.NODE_ENV === "development" ? "pitt-street" : undefined);
  const rawRole = claimString(claims, "role") ?? claimString(metadata, "role") ??
    (process.env.NODE_ENV === "development" ? "employee" : undefined);

  let resolvedOrganizationId = organizationId;
  let resolvedStoreId = storeId;
  let resolvedRole = rawRole;
  // An invited user may not have tenant claims yet. Resolve an existing
  // membership server-side so administrators can provision access before the
  // identity provider has refreshed its claims.
  if (!resolvedOrganizationId || !resolvedStoreId || !resolvedRole) {
    try {
      const memberships = await db.select({
        organizationId: membershipsTable.organizationId,
        storeId: membershipsTable.storeId,
        role: membershipsTable.role,
        status: membershipsTable.status,
      }).from(membershipsTable).where(eq(membershipsTable.clerkUserId, userId)).limit(1);
      const first = memberships[0];
      resolvedOrganizationId ??= first?.organizationId;
      resolvedStoreId ??= first?.storeId;
      resolvedRole ??= first?.role;
      if (!first && process.env.NODE_ENV !== "development") {
        res.status(403).json({
          code: "ACCESS_NOT_PROVISIONED",
          message: "Your account is not provisioned yet. Ask your headquarters administrator to invite you and assign a store.",
        });
        return;
      }
    } catch {
      res.status(503).json({ code: "ENTERPRISE_ACCESS_UNAVAILABLE", message: "Store access could not be verified. Please try again." });
      return;
    }
  }

  if (!resolvedOrganizationId || !resolvedStoreId || !resolvedRole || !validRoles.has(resolvedRole as EnterpriseRole)) {
    res.status(403).json({
      code: "ENTERPRISE_CONTEXT_REQUIRED",
      message: "Your account is authenticated but is not assigned to an Ausease organization and store. Ask your administrator for an invitation.",
    });
    return;
  }

  // Claims identify the requested tenant, but membership is the source of truth
  // for access and role. Never let a stale/forged role claim grant privileges.
  let membershipStatus: string | undefined;
  let membershipRole: string | undefined;
  try {
    const membership = await db.select({
      status: membershipsTable.status,
      role: membershipsTable.role,
    }).from(membershipsTable).where(and(
      eq(membershipsTable.clerkUserId, userId),
      eq(membershipsTable.organizationId, resolvedOrganizationId),
      eq(membershipsTable.storeId, resolvedStoreId),
    )).limit(1);
    membershipStatus = membership[0]?.status;
    membershipRole = membership[0]?.role;
  } catch {
    res.status(503).json({ code: "ENTERPRISE_ACCESS_UNAVAILABLE", message: "Store access could not be verified. Please try again." });
    return;
  }

  req.enterprise = {
    userId,
    organizationId: resolvedOrganizationId,
    storeId: resolvedStoreId,
    role: (membershipRole && validRoles.has(membershipRole as EnterpriseRole) ? membershipRole : resolvedRole) as EnterpriseRole,
    email: claimString(claims, "email", "email_address") ?? claimString(metadata, "email"),
    membershipStatus,
  };
  next();
};

export const requireRole = (...roles: EnterpriseRole[]): RequestHandler => (req, res, next) => {
  if (!req.enterprise || !canPerformRole(req.enterprise.role, roles)) {
    res.status(403).json({ code: "INSUFFICIENT_ROLE", message: "Your role cannot perform this action." });
    return;
  }
  next();
};

export const requireActiveMembership: RequestHandler = (req, res, next) => {
  if (!isActiveMembership(req.enterprise?.membershipStatus)) {
    res.status(403).json({
      code: req.enterprise?.membershipStatus === "disabled" ? "MEMBERSHIP_DISABLED" : "INVITATION_REQUIRED",
      message: req.enterprise?.membershipStatus === "disabled"
        ? "Your store access is disabled. Contact your administrator."
        : "Your store invitation is not active yet. Ask your administrator for access.",
    });
    return;
  }
  next();
};