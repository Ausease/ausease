import assert from "node:assert/strict";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { auditEventsTable, db, organizationsTable, presenceCheckinsTable, storesTable } from "@workspace/db";
import { writeAuditEvent } from "./audit";
import { checkStoreGeofence, getChecklistAccess, validateStoreGeofenceInput, type Coordinates } from "./geofence";

const farAway: Coordinates = { latitude: 40.7128, longitude: -74.006 };
const storeLocation = { latitude: 40.7128, longitude: -74.006 };

test("store geofence settings validate both pause states and reject invalid configuration", () => {
  assert.equal(validateStoreGeofenceInput({ ...storeLocation, geofenceEnabled: true }), true);
  assert.equal(validateStoreGeofenceInput({ ...storeLocation, geofenceEnabled: false }), true);
  assert.equal(validateStoreGeofenceInput({ ...storeLocation, geofenceRadiusMeters: 24 }), false);
  assert.equal(validateStoreGeofenceInput({ ...storeLocation, geofenceRadiusMeters: 2001 }), false);
  assert.equal(validateStoreGeofenceInput({ ...storeLocation, latitude: 91 }), false);
  assert.equal(validateStoreGeofenceInput({ ...storeLocation, geofenceEnabled: "false" as never }), false);
});

test("paused stores bypass missing configuration and distance checks while active stores enforce them", () => {
  const coordinates = { latitude: 40.7138, longitude: -74.006, accuracyMeters: 0 };
  const paused = checkStoreGeofence({ latitude: null, longitude: null, radiusMeters: 25, geofenceEnabled: false }, farAway);
  assert.deepEqual(paused, { allowed: true, reason: "inside_geofence", distanceMeters: 0 });

  const activeUnconfigured = checkStoreGeofence({ latitude: null, longitude: null, radiusMeters: 25, geofenceEnabled: true }, farAway);
  assert.deepEqual(activeUnconfigured, { allowed: false, reason: "store_not_configured", distanceMeters: 0 });

  const activeOutside = checkStoreGeofence({ ...storeLocation, radiusMeters: 25, geofenceEnabled: true }, coordinates);
  assert.equal(activeOutside.allowed, false);
  assert.equal(activeOutside.reason, "outside_geofence");
  assert.ok(activeOutside.distanceMeters > 25);
});

test("checklist access keeps user-and-manager presence rules unchanged when geofence is paused", async () => {
  const organizationId = `geofence-org-${Date.now()}`;
  const storeId = `geofence-store-${Date.now()}`;
  const userId = "geofence-employee";
  const managerId = "geofence-manager";
  const context = { userId, organizationId, storeId, role: "employee" as const };
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  const presenceScope = and(eq(presenceCheckinsTable.organizationId, organizationId), eq(presenceCheckinsTable.storeId, storeId));
  try {
    await db.insert(organizationsTable).values({ id: organizationId, name: "Geofence test organization" });
    await db.insert(storesTable).values({ id: storeId, organizationId, name: "Paused geofence store", geofenceEnabled: false });

    let access = await getChecklistAccess(context);
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "user_not_checked_in");

    await db.insert(presenceCheckinsTable).values([
      { id: `${storeId}-employee`, organizationId, storeId, clerkUserId: userId, role: "employee", latitude: 0, longitude: 0, expiresAt },
    ]);
    access = await getChecklistAccess(context);
    assert.equal(access.allowed, false);
    assert.equal(access.reason, "manager_not_checked_in");

    await db.insert(presenceCheckinsTable).values([
      { id: `${storeId}-manager`, organizationId, storeId, clerkUserId: managerId, role: "manager", latitude: 0, longitude: 0, expiresAt },
    ]);
    access = await getChecklistAccess(context);
    assert.equal(access.allowed, true);
    assert.equal(access.reason, "ready");
    assert.equal(access.store?.geofenceEnabled, false);
  } finally {
    await db.delete(presenceCheckinsTable).where(presenceScope);
    await db.delete(storesTable).where(eq(storesTable.id, storeId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
  }
});

test("enabling and disabling a store geofence preserves audit metadata", async () => {
  const organizationId = `geofence-audit-org-${Date.now()}`;
  const storeId = `geofence-audit-store-${Date.now()}`;
  const context = { userId: "geofence-admin", organizationId, storeId, role: "hq_admin" as const };
  const auditScope = and(eq(auditEventsTable.organizationId, organizationId), eq(auditEventsTable.storeId, storeId));
  try {
    await db.insert(organizationsTable).values({ id: organizationId, name: "Geofence audit organization" });
    await db.insert(storesTable).values({ id: storeId, organizationId, name: "Audited store", ...storeLocation, geofenceRadiusMeters: 100 });

    for (const geofenceEnabled of [false, true]) {
      const [store] = await db.update(storesTable).set({ geofenceEnabled }).where(and(
        eq(storesTable.id, storeId), eq(storesTable.organizationId, organizationId),
      )).returning();
      await writeAuditEvent(context, "enterprise.store_geofence_updated", "store", store.id, {
        radiusMeters: store.geofenceRadiusMeters, geofenceEnabled: store.geofenceEnabled,
      });
    }

    const audits = await db.select().from(auditEventsTable).where(auditScope);
    assert.equal(audits.length, 2);
    assert.deepEqual(audits.map((audit) => (audit.metadata as Record<string, unknown>).geofenceEnabled), [false, true]);
    assert.ok(audits.every((audit) => audit.actorClerkUserId === context.userId && audit.actorRole === context.role));
  } finally {
    await db.delete(auditEventsTable).where(auditScope);
    await db.delete(storesTable).where(eq(storesTable.id, storeId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
  }
});