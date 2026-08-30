import assert from "node:assert/strict";
import test from "node:test";
import {
  canPerformRole,
  invitationActivationTarget,
  isActiveMembership,
  isSameStoreScope,
} from "./authorization-policy";
import type { EnterpriseRole } from "./auth-types";

const roles: EnterpriseRole[] = ["employee", "manager", "reviewer", "hq_admin"];

test("anonymous and expired sessions have no active membership", () => {
  assert.equal(isActiveMembership(undefined), false);
  assert.equal(isActiveMembership("expired"), false);
  assert.equal(isActiveMembership(""), false);
});

test("invited and disabled members cannot access operational records", () => {
  assert.equal(isActiveMembership("invited"), false);
  assert.equal(isActiveMembership("disabled"), false);
});

test("active employee, manager, reviewer, and headquarters roles are recognized", () => {
  for (const role of roles) {
    assert.equal(isActiveMembership("active"), true);
    assert.equal(canPerformRole(role, roles), true);
  }
});

test("employee cannot perform manager, reviewer, or headquarters actions", () => {
  assert.equal(canPerformRole("employee", ["manager", "reviewer", "hq_admin"]), false);
  assert.equal(canPerformRole("manager", ["manager", "reviewer", "hq_admin"]), true);
  assert.equal(canPerformRole("reviewer", ["manager", "reviewer", "hq_admin"]), true);
  assert.equal(canPerformRole("hq_admin", ["manager", "reviewer", "hq_admin"]), true);
  assert.equal(canPerformRole(undefined, ["hq_admin"]), false);
});

test("organization and store scope must both match", () => {
  const storeA = { organizationId: "org-a", storeId: "store-a" };
  assert.equal(isSameStoreScope(storeA, storeA), true);
  assert.equal(isSameStoreScope(storeA, { organizationId: "org-a", storeId: "store-b" }), false);
  assert.equal(isSameStoreScope(storeA, { organizationId: "org-b", storeId: "store-a" }), false);
});

test("a verified email can activate its only pending invitation before claims refresh", () => {
  const invitation = {
    id: "membership-owner",
    clerkUserId: "pending:ankit@ausease.com",
    email: "ankit@ausease.com",
    organizationId: "demo-company",
    storeId: "pitt-street",
    status: "invited",
  };
  assert.equal(
    invitationActivationTarget([invitation], "user-owner", "ankit@ausease.com", {}),
    "membership-owner",
  );
});

test("an email-only activation never chooses between multiple pending tenants", () => {
  const invitations = [
    {
      id: "membership-a",
      clerkUserId: "pending:ankit@ausease.com",
      email: "ankit@ausease.com",
      organizationId: "org-a",
      storeId: "store-a",
      status: "invited",
    },
    {
      id: "membership-b",
      clerkUserId: "pending:ankit@ausease.com",
      email: "ankit@ausease.com",
      organizationId: "org-b",
      storeId: "store-b",
      status: "invited",
    },
  ];
  assert.equal(
    invitationActivationTarget(invitations, "user-owner", "ankit@ausease.com", {}),
    undefined,
  );
});

test("malformed scope values do not accidentally match", () => {
  assert.equal(isSameStoreScope(
    { organizationId: "org-a", storeId: "store-a" },
    { organizationId: "", storeId: "store-a" },
  ), false);
});

const invitation = (overrides: Partial<{
  id: string;
  clerkUserId: string;
  email: string | null;
  organizationId: string;
  storeId: string;
  status: string;
}> = {}) => ({
  id: "membership-1",
  clerkUserId: "pending:teammate@example.com",
  email: "teammate@example.com",
  organizationId: "org-a",
  storeId: "store-a",
  status: "invited",
  ...overrides,
});

test("accepted invitation activates the matching pending membership for the real Clerk user", () => {
  assert.equal(
    invitationActivationTarget(
      [invitation()],
      "user_real_clerk_id",
      "TEAMMATE@example.com".toLowerCase(),
      { organizationId: "org-a", storeId: "store-a" },
    ),
    "membership-1",
  );
});

test("an active membership is never replaced by an email-only match", () => {
  assert.equal(
    invitationActivationTarget(
      [invitation({ clerkUserId: "user_existing", status: "active" })],
      "user_new_clerk_id",
      "teammate@example.com",
      { organizationId: "org-a", storeId: "store-a" },
    ),
    undefined,
  );
});

test("a pending membership in another tenant is not activated by the wrong tenant context", () => {
  assert.equal(
    invitationActivationTarget(
      [invitation({ organizationId: "org-b", storeId: "store-b" })],
      "user_real_clerk_id",
      "teammate@example.com",
      { organizationId: "org-a", storeId: "store-a" },
    ),
    undefined,
  );
});
