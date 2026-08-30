import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo, Server } from "node:net";
import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { createApp } from "../app";
import type { EnterpriseContext } from "../middleware/auth";
import {
  checklistAssignmentsTable,
  checklistItemsTable,
  checklistProgressTable,
  checklistTemplatesTable,
  checklistVersionsTable,
  db,
  organizationsTable,
  presenceCheckinsTable,
  storesTable,
} from "@workspace/db";

const authenticatedAs = (context: EnterpriseContext): RequestHandler =>
  (req, _res, next) => {
    req.enterprise = context;
    next();
  };

const startServer = async (context: EnterpriseContext) => {
  const server = createApp(authenticatedAs(context)).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    request: (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${port}${path}`, init),
  };
};

const closeServer = async (server: Server | undefined) => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
};

const progressUpdate = (versionId: string, itemId: string, completed: boolean): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ versionId, itemId, completed }),
});

test("published checklist progress persists by user, store, work date, and immutable version", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = `checklist-progress-org-${suffix}`;
  const storeId = `checklist-progress-store-${suffix}`;
  const otherStoreId = `checklist-progress-other-store-${suffix}`;
  const userId = `checklist-progress-user-${suffix}`;
  const otherUserId = `checklist-progress-other-user-${suffix}`;
  const managerId = `checklist-progress-manager-${suffix}`;
  const templateId = `checklist-progress-template-${suffix}`;
  const version1Id = `checklist-progress-version-1-${suffix}`;
  const item1Id = `checklist-progress-item-1-${suffix}`;
  const version2Id = `checklist-progress-version-2-${suffix}`;
  const item2Id = `checklist-progress-item-2-${suffix}`;
  const effectiveAt = new Date(Date.now() - 60_000);
  const context = { userId, organizationId, storeId, role: "employee" as const, membershipStatus: "active" as const };
  let server: Server | undefined;

  await db.insert(organizationsTable).values({ id: organizationId, name: "Checklist progress organization" });
  await db.insert(storesTable).values([
    { id: storeId, organizationId, name: "Checklist progress store", geofenceEnabled: false },
    { id: otherStoreId, organizationId, name: "Other checklist progress store", geofenceEnabled: false },
  ]);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(presenceCheckinsTable).values([
    { id: `presence-user-${suffix}`, organizationId, storeId, clerkUserId: userId, role: "employee", latitude: 0, longitude: 0, expiresAt },
    { id: `presence-manager-${suffix}`, organizationId, storeId, clerkUserId: managerId, role: "manager", latitude: 0, longitude: 0, expiresAt },
    { id: `presence-user-other-store-${suffix}`, organizationId, storeId: otherStoreId, clerkUserId: userId, role: "employee", latitude: 0, longitude: 0, expiresAt },
    { id: `presence-manager-other-store-${suffix}`, organizationId, storeId: otherStoreId, clerkUserId: managerId, role: "manager", latitude: 0, longitude: 0, expiresAt },
  ]);
  await db.insert(checklistTemplatesTable).values({
    id: templateId,
    organizationId,
    name: "Daily opening standard",
    summary: "Prepare the store for trade.",
    owner: "Retail operations",
    createdBy: "hq-admin",
  });
  await db.insert(checklistVersionsTable).values({
    id: version1Id,
    templateId,
    version: 1,
    evidenceRule: "No evidence required",
    status: "published",
    effectiveAt,
    createdBy: "hq-admin",
    publishedAt: effectiveAt,
  });
  await db.insert(checklistItemsTable).values({
    id: item1Id,
    versionId: version1Id,
    position: 0,
    title: "Unlock the entrance",
    guidance: "Confirm the entry is safe and ready.",
    required: true,
    owner: "Opening team",
  });
  await db.insert(checklistAssignmentsTable).values({
    id: `assignment-v1-${suffix}`,
    versionId: version1Id,
    organizationId,
    storeId,
    role: "employee",
  });

  try {
    const app = await startServer(context);
    server = app.server;

    let response = await app.request("/api/checklists");
    assert.equal(response.status, 200);
    let body = await response.json() as { checklists: Array<{ versionId: string; workDate: string; items: Array<{ id: string; completed: boolean }> }> };
    assert.equal(body.checklists[0]?.versionId, version1Id);
    assert.equal(body.checklists[0]?.items[0]?.completed, false);
    const workDate = body.checklists[0]?.workDate;
    assert.match(workDate, /^\d{4}-\d{2}-\d{2}$/);

    response = await app.request(`/api/checklists/${templateId}/progress`, progressUpdate(version1Id, item1Id, true));
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { completed: boolean }).completed, true);

    response = await app.request("/api/checklists");
    body = await response.json() as typeof body;
    assert.equal(body.checklists[0]?.items[0]?.completed, true, "progress survives a fresh checklist request");

    await db.insert(checklistProgressTable).values({
      id: `old-date-progress-${suffix}`,
      organizationId,
      storeId,
      clerkUserId: otherUserId,
      templateId,
      versionId: version1Id,
      itemId: item1Id,
      dateKey: "2000-01-01",
      completed: true,
      completedAt: effectiveAt,
    });

    await closeServer(server);
    server = undefined;
    const otherUserApp = await startServer({ ...context, userId: otherUserId });
    server = otherUserApp.server;
    response = await otherUserApp.request("/api/checklists");
    body = await response.json() as typeof body;
    assert.equal(body.checklists[0]?.items[0]?.completed, false, "another user's and another work date's progress remain isolated");

    await closeServer(server);
    server = undefined;
    const otherStoreApp = await startServer({ ...context, storeId: otherStoreId });
    server = otherStoreApp.server;
    response = await otherStoreApp.request(`/api/checklists/${templateId}/progress`, progressUpdate(version1Id, item1Id, true));
    assert.equal(response.status, 404, "an unassigned store cannot update checklist progress");

    await closeServer(server);
    server = undefined;
    await db.insert(checklistVersionsTable).values({
      id: version2Id,
      templateId,
      version: 2,
      evidenceRule: "No evidence required",
      status: "published",
      effectiveAt,
      createdBy: "hq-admin",
      publishedAt: effectiveAt,
    });
    await db.insert(checklistItemsTable).values({
      id: item2Id,
      versionId: version2Id,
      position: 0,
      title: "Complete the updated opening check",
      guidance: "Follow the latest published standard.",
      required: true,
      owner: "Opening team",
    });
    await db.insert(checklistAssignmentsTable).values({
      id: `assignment-v2-${suffix}`,
      versionId: version2Id,
      organizationId,
      storeId,
      role: "employee",
    });

    const latestVersionApp = await startServer(context);
    server = latestVersionApp.server;
    response = await latestVersionApp.request("/api/checklists");
    body = await response.json() as typeof body;
    assert.equal(body.checklists[0]?.versionId, version2Id);
    assert.equal(body.checklists[0]?.items[0]?.completed, false);

    const [priorProgress] = await db.select().from(checklistProgressTable).where(and(
      eq(checklistProgressTable.clerkUserId, userId),
      eq(checklistProgressTable.versionId, version1Id),
      eq(checklistProgressTable.itemId, item1Id),
    )).limit(1);
    assert.equal(priorProgress?.completed, true, "publishing a later version does not alter completed prior-version history");
  } finally {
    await closeServer(server);
  }
});