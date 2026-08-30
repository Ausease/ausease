import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { db, organizationsTable, storesTable } from "../index";

test("deployed store schema exposes a non-null true-default geofence setting", async () => {
  const result = await db.execute(sql`
    select
      data_type,
      is_nullable,
      column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ausease_stores'
      and column_name = 'geofence_enabled'
  `);

  assert.equal(result.rows.length, 1, "ausease_stores.geofence_enabled must exist");
  const column = result.rows[0] as {
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  };
  assert.equal(column.data_type, "boolean");
  assert.equal(column.is_nullable, "NO");
  assert.match(column.column_default ?? "", /true/);
});

test("stores created without a geofence value receive the default and can be updated", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = `geofence-schema-org-${suffix}`;
  const storeId = `geofence-schema-store-${suffix}`;

  try {
    await db.insert(organizationsTable).values({
      id: organizationId,
      name: "Geofence schema release organization",
    });
    await db.insert(storesTable).values({
      id: storeId,
      organizationId,
      name: "Geofence schema release store",
    });

    const [created] = await db.select({
      geofenceEnabled: storesTable.geofenceEnabled,
    }).from(storesTable).where(sql`${storesTable.id} = ${storeId}`);
    assert.equal(created?.geofenceEnabled, true);

    const [updated] = await db.update(storesTable)
      .set({ geofenceEnabled: false })
      .where(sql`${storesTable.id} = ${storeId}`)
      .returning({ geofenceEnabled: storesTable.geofenceEnabled });
    assert.equal(updated?.geofenceEnabled, false);
  } finally {
    await db.delete(storesTable).where(sql`${storesTable.id} = ${storeId}`);
    await db.delete(organizationsTable).where(sql`${organizationsTable.id} = ${organizationId}`);
  }
});