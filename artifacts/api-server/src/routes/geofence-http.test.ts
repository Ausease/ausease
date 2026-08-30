import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo, Server } from "node:net";
import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { createApp } from "../app";
import type { EnterpriseContext } from "../middleware/auth";
import {
  auditEventsTable,
  correctiveActionsTable,
  db,
  membershipsTable,
  organizationsTable,
  operationsRecordsTable,
  presenceCheckinsTable,
  routineDefinitionsTable,
  routineInstancesTable,
  storesTable,
} from "@workspace/db";

const location = { latitude: 40.7128, longitude: -74.006 };

const authenticatedAs = (context: EnterpriseContext): RequestHandler =>
  (req, _res, next) => {
    req.enterprise = context;
    next();
  };

const unauthenticated: RequestHandler = (_req, res) => {
  res.status(401).json({ message: "Authentication is required." });
};

const startServer = async (auth: EnterpriseContext | RequestHandler) => {
  const enterpriseAuth = typeof auth === "function" ? auth : authenticatedAs(auth);
  const server = createApp(enterpriseAuth).listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    request: (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init),
  };
};

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const assertAccessRejected = async (
  request: (path: string, init?: RequestInit) => Promise<Response>,
  storeId: string,
  expected: { status: number; body: Record<string, unknown> },
) => {
  const responses = await Promise.all([
    request("/api/presence/status"),
    request("/api/presence/check-in", json({ latitude: 40.7128, longitude: -74.006 })),
    request("/api/checklists/access"),
    request(`/api/admin/stores/${storeId}`, json({ geofenceEnabled: true }, "PATCH")),
  ]);

  for (const response of responses) {
    assert.equal(response.status, expected.status);
    assert.deepEqual(await response.json(), expected.body);
  }
};

test("geofence HTTP endpoints preserve status codes and response shapes", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = `geofence-http-org-${suffix}`;
  const storeId = `geofence-http-store-${suffix}`;
  const userId = `geofence-http-user-${suffix}`;
  const managerId = `geofence-http-manager-${suffix}`;
  const adminId = `geofence-http-admin-${suffix}`;
  const contexts = {
    employee: { userId, organizationId, storeId, role: "employee" as const, membershipStatus: "active" as const },
    manager: { userId: managerId, organizationId, storeId, role: "manager" as const, membershipStatus: "active" as const },
    admin: { userId: adminId, organizationId, storeId, role: "hq_admin" as const, membershipStatus: "active" as const },
  };
  let server: Server | undefined;
  const auditScope = and(eq(auditEventsTable.organizationId, organizationId), eq(auditEventsTable.storeId, storeId));
  const presenceScope = and(eq(presenceCheckinsTable.organizationId, organizationId), eq(presenceCheckinsTable.storeId, storeId));

  try {
    await db.insert(organizationsTable).values({ id: organizationId, name: "Geofence HTTP organization" });
    await db.insert(storesTable).values({
      id: storeId, organizationId, name: "HTTP geofence store", ...location, geofenceRadiusMeters: 100,
    });
    await db.insert(membershipsTable).values([
      { id: `${storeId}-employee-membership`, organizationId, storeId, clerkUserId: userId, role: "employee", status: "active" },
      { id: `${storeId}-manager-membership`, organizationId, storeId, clerkUserId: managerId, role: "manager", status: "active" },
      { id: `${storeId}-admin-membership`, organizationId, storeId, clerkUserId: adminId, role: "hq_admin", status: "active" },
    ]);

    const adminServer = await startServer(contexts.admin);
    server = adminServer.server;
    let response = await adminServer.request(`/api/admin/stores/${storeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...location, geofenceRadiusMeters: 250, geofenceEnabled: false }),
    });
    assert.equal(response.status, 200);
    let body = await response.json() as Record<string, unknown>;
    assert.equal(body.id, storeId);
    assert.equal(body.geofenceRadiusMeters, 250);
    assert.equal(body.geofenceEnabled, false);

    const employeeServer = await startServer(contexts.employee);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = employeeServer.server;
    response = await employeeServer.request(`/api/admin/stores/${storeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...location, geofenceEnabled: true }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "INSUFFICIENT_ROLE", message: "Your role cannot perform this action.",
    });

    response = await employeeServer.request("/api/presence/check-in", json({ latitude: 0, longitude: 0 }));
    assert.equal(response.status, 200);
    body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body.checkedIn, true);
    assert.equal(body.role, "employee");
    assert.equal((body.store as Record<string, unknown>).geofenceEnabled, false);
    assert.equal(body.distanceMeters, 0);
    assert.match(String(body.expiresAt), /^\d{4}-\d{2}-\d{2}T/);

    await db.delete(presenceCheckinsTable).where(presenceScope);
    await db.update(storesTable).set({ geofenceEnabled: true, latitude: null, longitude: null }).where(eq(storesTable.id, storeId));
    response = await employeeServer.request("/api/presence/check-in", json({ ...location }));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      code: "STORE_GEOFENCE_NOT_CONFIGURED",
      message: "Your store's location has not been configured yet.",
    });

    await db.update(storesTable).set({ latitude: location.latitude, longitude: location.longitude, geofenceRadiusMeters: 100 }).where(eq(storesTable.id, storeId));
    response = await employeeServer.request("/api/presence/check-in", json({ latitude: 40.7138, longitude: -74.006 }));
    assert.equal(response.status, 403);
    body = await response.json() as Record<string, unknown>;
    assert.equal(body.code, "OUTSIDE_STORE_GEOFENCE");
    assert.equal(body.radiusMeters, 100);
    assert.equal(typeof body.distanceMeters, "number");
    assert.match(String(body.message), /HTTP geofence store/);

    response = await employeeServer.request("/api/checklists/access");
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      allowed: false, reason: "user_not_checked_in", store: {
        id: storeId, name: "HTTP geofence store", radiusMeters: 100, geofenceEnabled: true,
      }, userPresent: false, managerPresent: false, userExpiresAt: null, managerExpiresAt: null,
    });

    await db.insert(presenceCheckinsTable).values({
      id: `${storeId}-employee-presence`, organizationId, storeId, clerkUserId: userId,
      role: "employee", latitude: location.latitude, longitude: location.longitude,
      expiresAt: new Date(Date.now() + 60_000),
    });
    response = await employeeServer.request("/api/checklists/access");
    assert.equal(response.status, 403);
    body = await response.json() as Record<string, unknown>;
    assert.equal(body.reason, "manager_not_checked_in");

    await db.insert(presenceCheckinsTable).values({
      id: `${storeId}-manager-presence`, organizationId, storeId, clerkUserId: managerId,
      role: "manager", latitude: location.latitude, longitude: location.longitude,
      expiresAt: new Date(Date.now() + 60_000),
    });
    response = await employeeServer.request("/api/checklists/access");
    assert.equal(response.status, 200);
    body = await response.json() as Record<string, unknown>;
    assert.equal(body.allowed, true);
    assert.equal(body.reason, "ready");
    assert.equal(body.userPresent, true);
    assert.equal(body.managerPresent, true);
  } finally {
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await db.delete(auditEventsTable).where(auditScope);
    await db.delete(presenceCheckinsTable).where(presenceScope);
    await db.delete(membershipsTable).where(eq(membershipsTable.organizationId, organizationId));
    await db.delete(storesTable).where(eq(storesTable.id, storeId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
  }
});

test("geofence HTTP endpoints reject unauthenticated and inactive sessions", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storeId = `geofence-auth-store-${suffix}`;
  const baseContext = {
    userId: `geofence-auth-user-${suffix}`,
    organizationId: `geofence-auth-org-${suffix}`,
    storeId,
    role: "employee" as const,
  };
  const invited = { ...baseContext, membershipStatus: "invited" as const };
  const disabled = { ...baseContext, membershipStatus: "disabled" as const };
  const servers: Server[] = [];

  try {
    const anonymousServer = await startServer(unauthenticated);
    servers.push(anonymousServer.server);
    await assertAccessRejected(anonymousServer.request, storeId, {
      status: 401,
      body: { message: "Authentication is required." },
    });

    const invitedServer = await startServer(invited);
    servers.push(invitedServer.server);
    await assertAccessRejected(invitedServer.request, storeId, {
      status: 403,
      body: {
        code: "INVITATION_REQUIRED",
        message: "Your store invitation is not active yet. Ask your administrator for access.",
      },
    });

    const disabledServer = await startServer(disabled);
    servers.push(disabledServer.server);
    await assertAccessRejected(disabledServer.request, storeId, {
      status: 403,
      body: {
        code: "MEMBERSHIP_DISABLED",
        message: "Your store access is disabled. Contact your administrator.",
      },
    });
  } finally {
    await Promise.all(servers.filter((server) => server.listening).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ));
  }
});

test("enterprise operations protect routine and corrective-action transitions", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = `operations-http-org-${suffix}`;
  const storeId = `operations-http-store-${suffix}`;
  const otherStoreId = `operations-http-other-store-${suffix}`;
  const managerId = `operations-http-manager-${suffix}`;
  const employeeId = `operations-http-employee-${suffix}`;
  const contexts = {
    manager: { userId: managerId, organizationId, storeId, role: "manager" as const, membershipStatus: "active" as const },
    employee: { userId: employeeId, organizationId, storeId, role: "employee" as const, membershipStatus: "active" as const },
    otherStore: { userId: `operations-http-other-${suffix}`, organizationId, storeId: otherStoreId, role: "manager" as const, membershipStatus: "active" as const },
  };
  const organizationScope = eq(organizationsTable.id, organizationId);
  const storeScope = eq(storesTable.organizationId, organizationId);
  const routineDefinitionScope = eq(routineDefinitionsTable.organizationId, organizationId);
  const routineInstanceScope = eq(routineInstancesTable.organizationId, organizationId);
  const actionScope = eq(correctiveActionsTable.organizationId, organizationId);
  const recordScope = eq(operationsRecordsTable.organizationId, organizationId);
  const auditScope = eq(auditEventsTable.organizationId, organizationId);
  const servers: Server[] = [];

  try {
    await db.insert(organizationsTable).values({ id: organizationId, name: "Operations HTTP organization" });
    await db.insert(storesTable).values([
      { id: storeId, organizationId, name: "Operations store" },
      { id: otherStoreId, organizationId, name: "Other operations store" },
    ]);
    await db.insert(membershipsTable).values([
      { id: `${storeId}-manager-membership`, organizationId, storeId, clerkUserId: managerId, role: "manager", status: "active" },
      { id: `${storeId}-employee-membership`, organizationId, storeId, clerkUserId: employeeId, role: "employee", status: "active" },
      { id: `${otherStoreId}-manager-membership`, organizationId, storeId: otherStoreId, clerkUserId: contexts.otherStore.userId, role: "manager", status: "active" },
    ]);
    // Seed the definitions with a due time just before the current Sydney time
    // so the endpoint must exercise its overdue escalation path.
    const sydneyParts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const sydneyMinutes = Number(sydneyParts.find((part) => part.type === "hour")?.value ?? 0) * 60
      + Number(sydneyParts.find((part) => part.type === "minute")?.value ?? 0);
    const overdueDueTime = `${String(Math.floor((sydneyMinutes + 1_439) % 1_440 / 60)).padStart(2, "0")}:${String((sydneyMinutes + 1_439) % 60).padStart(2, "0")}`;
    await db.insert(routineDefinitionsTable).values([
      { id: `default:${organizationId}:sod`, organizationId, name: "Start of Day", routineType: "sod", dueTime: overdueDueTime, assignedRole: "employee", evidenceRequired: true },
      { id: `default:${organizationId}:eod`, organizationId, name: "End of Day", routineType: "eod", dueTime: overdueDueTime, assignedRole: "employee", evidenceRequired: true },
    ]);
    const managerServer = await startServer(contexts.manager);
    const employeeServer = await startServer(contexts.employee);
    const otherStoreServer = await startServer(contexts.otherStore);
    servers.push(managerServer.server, employeeServer.server, otherStoreServer.server);

    let response = await employeeServer.request("/api/routines/today");
    assert.equal(response.status, 200);
    const firstRoutines = await response.json() as { dateKey: string; routines: Array<Record<string, unknown>> };
    assert.equal(firstRoutines.routines.length, 2);
    assert.equal(firstRoutines.routines.filter((routine) => routine.evidenceRequired === true).length, 2);
    assert.ok(firstRoutines.routines.every((routine) => routine.status === "overdue"));
    const escalatedInstances = await db.select().from(routineInstancesTable).where(routineInstanceScope);
    assert.equal(escalatedInstances.length, 2);
    assert.ok(escalatedInstances.every((routine) => routine.status === "overdue" && routine.escalatedAt));

    response = await employeeServer.request("/api/routines/today");
    const secondRoutines = await response.json() as { routines: Array<Record<string, unknown>> };
    assert.equal(response.status, 200);
    assert.equal(secondRoutines.routines.length, 2, "hydrating today's routines must be idempotent");
    const sod = firstRoutines.routines.find((routine) => routine.routineType === "sod");
    assert.ok(sod);

    response = await employeeServer.request(`/api/routines/${sod.routineId}/complete`, json({ evidenceCount: 0 }));
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      code: "EVIDENCE_REQUIRED",
      message: "Add at least one evidence item before completing this routine.",
    });

    response = await employeeServer.request(`/api/routines/${sod.routineId}/complete`, json({ evidenceCount: 1 }));
    assert.equal(response.status, 200);
    const completed = await response.json() as Record<string, unknown>;
    assert.equal(completed.status, "completed");
    assert.equal(completed.evidenceCount, 1);

    response = await employeeServer.request(`/api/routines/${sod.routineId}/complete`, json({ evidenceCount: 1 }));
    assert.equal(response.status, 200);
    assert.equal((await response.json() as Record<string, unknown>).status, "completed");

    response = await employeeServer.request("/api/routines/today");
    const afterCompletion = await response.json() as { routines: Array<Record<string, unknown>> };
    assert.equal(afterCompletion.routines.find((routine) => routine.routineType === "sod")?.status, "completed");

    const actionResponse = await managerServer.request("/api/corrective-actions", json({
      title: "Review closing variance",
      evidenceRequired: true,
      sourceRoutineId: String(sod.id),
    }));
    assert.equal(actionResponse.status, 201);
    const action = await actionResponse.json() as Record<string, unknown>;
    assert.equal(action.status, "open");

    response = await employeeServer.request(`/api/corrective-actions/${action.id}`, json({ status: "completed" }, "PATCH"));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "INSUFFICIENT_ROLE",
      message: "Your role cannot perform this action.",
    });

    response = await managerServer.request(`/api/corrective-actions/${action.id}`, json({ status: "completed" }, "PATCH"));
    assert.equal(response.status, 200);
    const closedAction = await response.json() as Record<string, unknown>;
    assert.equal(closedAction.status, "completed");
    assert.ok(closedAction.completedAt);

    response = await managerServer.request(`/api/corrective-actions/${action.id}`, json({ status: "open" }, "PATCH"));
    assert.equal(response.status, 200);
    const reopenedAction = await response.json() as Record<string, unknown>;
    assert.equal(reopenedAction.status, "open");
    assert.equal(reopenedAction.completedAt, null);

    response = await otherStoreServer.request(`/api/corrective-actions/${action.id}`, json({ status: "completed" }, "PATCH"));
    assert.equal(response.status, 404, "an action from another store must not be visible or mutable");

    await db.insert(operationsRecordsTable).values([
      { id: `${storeId}-task`, organizationId, storeId, kind: "task", payload: { done: true, title: "Counted task" }, createdBy: managerId },
      { id: `${storeId}-open-task`, organizationId, storeId, kind: "task", payload: { done: false, title: "Open task" }, createdBy: managerId },
      { id: `${storeId}-issue`, organizationId, storeId, kind: "issue", payload: { status: "Open", title: "Counted issue" }, createdBy: managerId },
      { id: `${otherStoreId}-task`, organizationId, storeId: otherStoreId, kind: "task", payload: { done: false }, createdBy: contexts.otherStore.userId },
    ]);
    response = await managerServer.request("/api/operations/command-center");
    assert.equal(response.status, 200);
    const center = await response.json() as { metrics: Record<string, number>; actions: Array<Record<string, unknown>>; routines: Array<Record<string, unknown>> };
    assert.equal(center.metrics.tasksTotal, 2);
    assert.equal(center.metrics.tasksCompleted, 1);
    assert.equal(center.metrics.openIssues, 1);
    assert.equal(center.metrics.openActions, 1);
    assert.equal(center.metrics.overdueRoutines, 0);
    assert.equal(center.routines.length, 2);
    assert.equal(center.actions.length, 1);
    assert.equal(center.actions[0].id, action.id);
  } finally {
    await Promise.all(servers.filter((server) => server.listening).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ));
    await db.delete(auditEventsTable).where(auditScope);
    await db.delete(operationsRecordsTable).where(recordScope);
    await db.delete(correctiveActionsTable).where(actionScope);
    await db.delete(routineInstancesTable).where(routineInstanceScope);
    await db.delete(routineDefinitionsTable).where(routineDefinitionScope);
    await db.delete(membershipsTable).where(eq(membershipsTable.organizationId, organizationId));
    await db.delete(storesTable).where(storeScope);
    await db.delete(organizationsTable).where(organizationScope);
  }
});