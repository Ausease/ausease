import { and, eq, gt } from "drizzle-orm";
import { db, presenceCheckinsTable, storesTable } from "@workspace/db";
import type { EnterpriseContext } from "../middleware/auth";

export const PRESENCE_WINDOW_MS = 10 * 60 * 1000;
export type PresenceRole = "employee" | "manager";

export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export type ChecklistAccess = {
  allowed: boolean;
  reason: "ready" | "store_not_configured" | "user_not_checked_in" | "manager_not_checked_in";
  store: { id: string; name: string; radiusMeters: number; geofenceEnabled: boolean } | null;
  userPresent: boolean;
  managerPresent: boolean;
  userExpiresAt: Date | null;
  managerExpiresAt: Date | null;
};

export type StoreGeofenceInput = {
  latitude: number;
  longitude: number;
  geofenceRadiusMeters?: number;
  geofenceEnabled?: boolean;
};

export function validateStoreGeofenceInput(input: StoreGeofenceInput) {
  return Number.isFinite(input.latitude) && input.latitude >= -90 && input.latitude <= 90 &&
    Number.isFinite(input.longitude) && input.longitude >= -180 && input.longitude <= 180 &&
    (input.geofenceRadiusMeters === undefined ||
      (Number.isFinite(input.geofenceRadiusMeters) && input.geofenceRadiusMeters >= 25 && input.geofenceRadiusMeters <= 2000)) &&
    (input.geofenceEnabled === undefined || typeof input.geofenceEnabled === "boolean");
}

export function checkStoreGeofence(
  store: { latitude: number | null; longitude: number | null; radiusMeters: number; geofenceEnabled: boolean },
  coordinates: Coordinates,
) {
  if (store.geofenceEnabled && (store.latitude === null || store.longitude === null)) {
    return { allowed: false as const, reason: "store_not_configured" as const, distanceMeters: 0 };
  }
  const distanceMeters = store.geofenceEnabled && store.latitude !== null && store.longitude !== null
    ? distanceInMeters(coordinates, { latitude: store.latitude, longitude: store.longitude }) : 0;
  const accuracyAllowance = Math.min(coordinates.accuracyMeters ?? 0, 100);
  if (store.geofenceEnabled && distanceMeters > store.radiusMeters + accuracyAllowance) {
    return { allowed: false as const, reason: "outside_geofence" as const, distanceMeters };
  }
  return { allowed: true as const, reason: "inside_geofence" as const, distanceMeters };
}

export function distanceInMeters(a: Coordinates, b: Coordinates) {
  const earthRadius = 6_371_000;
  const latitudeDelta = (b.latitude - a.latitude) * Math.PI / 180;
  const longitudeDelta = (b.longitude - a.longitude) * Math.PI / 180;
  const latitudeA = a.latitude * Math.PI / 180;
  const latitudeB = b.latitude * Math.PI / 180;
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function validateCoordinates(input: Coordinates) {
  return Number.isFinite(input.latitude) && input.latitude >= -90 && input.latitude <= 90 &&
    Number.isFinite(input.longitude) && input.longitude >= -180 && input.longitude <= 180 &&
    (input.accuracyMeters === undefined || (Number.isFinite(input.accuracyMeters) && input.accuracyMeters >= 0));
}

export async function getChecklistAccess(context: EnterpriseContext): Promise<ChecklistAccess> {
  const [store] = await db.select({
    id: storesTable.id,
    name: storesTable.name,
    latitude: storesTable.latitude,
    longitude: storesTable.longitude,
    radiusMeters: storesTable.geofenceRadiusMeters,
    geofenceEnabled: storesTable.geofenceEnabled,
  }).from(storesTable).where(and(
    eq(storesTable.id, context.storeId),
    eq(storesTable.organizationId, context.organizationId),
  )).limit(1);
  if (!store || (store.geofenceEnabled && (store.latitude === null || store.longitude === null))) {
    return {
      allowed: false, reason: "store_not_configured", store: store ? { id: store.id, name: store.name, radiusMeters: store.radiusMeters, geofenceEnabled: store.geofenceEnabled } : null,
      userPresent: false, managerPresent: false, userExpiresAt: null, managerExpiresAt: null,
    };
  }
  const now = new Date();
  const activePresence = await db.select({
    clerkUserId: presenceCheckinsTable.clerkUserId,
    role: presenceCheckinsTable.role,
    expiresAt: presenceCheckinsTable.expiresAt,
  }).from(presenceCheckinsTable).where(and(
    eq(presenceCheckinsTable.organizationId, context.organizationId),
    eq(presenceCheckinsTable.storeId, context.storeId),
    gt(presenceCheckinsTable.expiresAt, now),
  ));
  const user = activePresence.find((entry) => entry.clerkUserId === context.userId && entry.role === "employee");
  const manager = activePresence.find((entry) => entry.role === "manager");
  const userPresent = Boolean(user);
  const managerPresent = Boolean(manager);
  return {
    allowed: userPresent && managerPresent,
    reason: userPresent ? managerPresent ? "ready" : "manager_not_checked_in" : "user_not_checked_in",
    store: { id: store.id, name: store.name, radiusMeters: store.radiusMeters, geofenceEnabled: store.geofenceEnabled },
    userPresent, managerPresent,
    userExpiresAt: user?.expiresAt ?? null,
    managerExpiresAt: manager?.expiresAt ?? null,
  };
}