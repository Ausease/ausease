import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { applicationTables, db } from "../index";
import {
  deploymentSchema,
  findUnexpectedPublishedObjects,
  type DeploymentColumn,
} from "./deployment-schema";

function normalizeDefault(value: string | null): string | null {
  if (value === null) return null;
  let normalized = value.toLowerCase().trim();
  normalized = normalized.replace(/::[a-z ]+/g, "");
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized.replace(/\s+/g, " ");
}

function findStaleDeploymentColumns(
  contract: readonly DeploymentColumn[],
): string[] {
  const declaredColumns = new Map<string, Set<string>>(
    applicationTables.map((table) => [
      getTableName(table),
      new Set(Object.values(getTableColumns(table)).map((column) => column.name)),
    ]),
  );

  return contract
    .filter((expected) => declaredColumns.has(expected.table))
    .filter((expected) => !declaredColumns.get(expected.table)?.has(expected.column))
    .map(({ table, column }) => `${table}.${column}`);
}

function assertActionableDriftFailure(
  failure: Error | undefined,
  identifiers: readonly string[],
  entity: "table" | "column",
): void {
  assert.ok(failure);
  for (const identifier of identifiers) {
    assert.ok(
      failure.message.includes(identifier),
      `Expected drift failure to list ${identifier}`,
    );
  }
  assert.match(failure.message, new RegExp(`Remove each stale ${entity} from deploymentSchema`));
  assert.match(failure.message, /restore its application schema declaration/);
}

function publishedSchemaDriftMessage(mismatches: readonly string[]): string {
  return (
    `Published database schema drift detected:\n- ${mismatches.join("\n- ")}\n\n` +
    "Review the deployment schema contract and application schema declaration. " +
    "Remove unexpected published tables or columns, or update deploymentSchema intentionally, " +
    "then apply the corresponding application schema migration before publishing."
  );
}

test("every declared application table is covered by the deployment schema contract", () => {
  const contractTables = new Set(deploymentSchema.map(({ table }) => table));
  const missingTables = applicationTables
    .map((table) => getTableName(table))
    .filter((tableName) => !contractTables.has(tableName));

  assert.deepEqual(
    missingTables,
    [],
    `Deployment schema contract is missing application table(s): ${missingTables.join(", ")}. ` +
      "Register each table's critical columns in deploymentSchema.",
  );
});

test("every deployment schema contract table is declared by the application schema", () => {
  const applicationTableNames = new Set<string>(applicationTables.map((table) => getTableName(table)));
  const staleTables = [...new Set(deploymentSchema.map(({ table }) => table))]
    .filter((tableName) => !applicationTableNames.has(tableName));

  assert.deepEqual(
    staleTables,
    [],
    `Deployment schema contract contains table(s) no longer declared by the application schema: ${staleTables.join(", ")}. ` +
      "Remove each stale table from deploymentSchema or restore its application schema declaration.",
  );
});

test("reports retired tables with actionable remediation guidance", () => {
  const staleTableNames = ["ausease_retired_locations", "ausease_retired_shifts"];
  const contractWithStaleTables = [
    ...deploymentSchema,
    ...staleTableNames.map((table) => ({ ...deploymentSchema[0], table })),
  ];
  const applicationTableNames = new Set<string>(applicationTables.map((table) => getTableName(table)));
  const staleTables = [...new Set(contractWithStaleTables.map(({ table }) => table))]
    .filter((tableName) => !applicationTableNames.has(tableName));

  let failure: Error | undefined;
  try {
    assert.deepEqual(
      staleTables,
      [],
      `Deployment schema contract contains table(s) no longer declared by the application schema: ${staleTables.join(", ")}. ` +
        "Remove each stale table from deploymentSchema or restore its application schema declaration.",
    );
  } catch (error) {
    failure = error as Error;
  }

  assertActionableDriftFailure(failure, staleTableNames, "table");
});

test("every deployment schema contract column is declared by its application table", () => {
  const staleColumns = findStaleDeploymentColumns(deploymentSchema);

  assert.deepEqual(
    staleColumns,
    [],
    `Deployment schema contract contains column(s) no longer declared by the application schema: ${staleColumns.join(", ")}. ` +
      "Remove each stale column from deploymentSchema or restore its application schema declaration.",
  );
});

test("identifies every retired column under a valid application table", () => {
  const staleColumns = findStaleDeploymentColumns([
    ...deploymentSchema,
    { ...deploymentSchema[0], column: "retired_name" },
    { ...deploymentSchema[1], column: "retired_status" },
  ]);

  assert.deepEqual(staleColumns, [
    "ausease_organizations.retired_name",
    "ausease_organizations.retired_status",
  ]);
});

test("reports retired columns with actionable remediation guidance", () => {
  const staleColumns = findStaleDeploymentColumns([
    ...deploymentSchema,
    { ...deploymentSchema[0], column: "retired_name" },
    { ...deploymentSchema[1], column: "retired_status" },
  ]);

  let failure: Error | undefined;
  try {
    assert.deepEqual(
      staleColumns,
      [],
      `Deployment schema contract contains column(s) no longer declared by the application schema: ${staleColumns.join(", ")}. ` +
        "Remove each stale column from deploymentSchema or restore its application schema declaration.",
    );
  } catch (error) {
    failure = error as Error;
  }

  assertActionableDriftFailure(
    failure,
    ["ausease_organizations.retired_name", "ausease_organizations.retired_status"],
    "column",
  );
});

test("reports every published schema mismatch with actionable remediation guidance", () => {
  const mismatches = [
    "ausease_organizations.id: missing (expected uuid)",
    "ausease_organizations.name: type is integer, expected character varying",
    "ausease_organizations.created_at: nullable is YES, expected NO",
    "ausease_organizations.updated_at: default is none, expected now()",
  ];
  const failureMessage = publishedSchemaDriftMessage(mismatches);

  for (const mismatch of mismatches) {
    assert.ok(
      failureMessage.includes(mismatch),
      `Expected published schema drift failure to list ${mismatch}`,
    );
  }
  assert.match(failureMessage, /deployment schema contract/);
  assert.match(failureMessage, /application schema declaration/);
  assert.match(failureMessage, /Remove unexpected published tables or columns/);
});

test("identifies an unexpected published application table", () => {
  const unexpected = findUnexpectedPublishedObjects([
    { table: "ausease_organizations", column: "id" },
    { table: "ausease_retired_locations", column: "id" },
    { table: "ausease_retired_locations", column: "name" },
  ]);

  assert.deepEqual(unexpected, [
    { table: "ausease_retired_locations", kind: "table" },
  ]);
});

test("identifies an unexpected column under a published application table", () => {
  const unexpected = findUnexpectedPublishedObjects([
    { table: "ausease_organizations", column: "id" },
    { table: "ausease_organizations", column: "retired_name" },
  ]);

  assert.deepEqual(unexpected, [
    { table: "ausease_organizations", column: "retired_name", kind: "column" },
  ]);
});

test("reports unexpected published objects with actionable remediation guidance", () => {
  const unexpected = findUnexpectedPublishedObjects([
    { table: "ausease_retired_locations", column: "id" },
    { table: "ausease_organizations", column: "retired_name" },
  ]);
  const failureMessage = publishedSchemaDriftMessage([
    ...unexpected.map((object) =>
      object.kind === "table"
        ? `${object.table}: unexpected table`
        : `${object.table}.${object.column}: unexpected column`,
    ),
  ]);

  assert.match(failureMessage, /ausease_retired_locations: unexpected table/);
  assert.match(failureMessage, /ausease_organizations\.retired_name: unexpected column/);
  assert.match(failureMessage, /Remove unexpected published tables or columns/);
  assert.match(failureMessage, /update deploymentSchema intentionally/);
});

test("published database matches the deployment schema contract", async () => {
  const result = await db.execute(sql`
    select
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name like 'ausease_%'
  `);

  const actual = new Map(
    result.rows.map((row) => {
      const column = row as {
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      };
      return [`${column.table_name}.${column.column_name}`, column];
    }),
  );
  const mismatches: string[] = [];
  const unexpectedObjects = findUnexpectedPublishedObjects(
    result.rows.map((row) => {
      const column = row as { table_name: string; column_name: string };
      return { table: column.table_name, column: column.column_name };
    }),
  );

  for (const unexpected of unexpectedObjects) {
    if (unexpected.kind === "table") {
      mismatches.push(`${unexpected.table}: unexpected table`);
    } else {
      mismatches.push(`${unexpected.table}.${unexpected.column}: unexpected column`);
    }
  }

  for (const expected of deploymentSchema) {
    const key = `${expected.table}.${expected.column}`;
    const observed = actual.get(key);
    if (!observed) {
      mismatches.push(`${key}: missing (expected ${expected.dataType})`);
      continue;
    }

    const expectedNullable = expected.nullable ? "YES" : "NO";
    if (observed.data_type !== expected.dataType) {
      mismatches.push(`${key}: type is ${observed.data_type}, expected ${expected.dataType}`);
    }
    if (observed.is_nullable !== expectedNullable) {
      mismatches.push(`${key}: nullable is ${observed.is_nullable}, expected ${expectedNullable}`);
    }
    const observedDefault = normalizeDefault(observed.column_default);
    const expectedDefault = normalizeDefault(expected.defaultValue);
    if (observedDefault !== expectedDefault) {
      mismatches.push(`${key}: default is ${observed.column_default ?? "none"}, expected ${expected.defaultValue ?? "none"}`);
    }
  }

  assert.deepEqual(
    mismatches,
    [],
    publishedSchemaDriftMessage(mismatches),
  );
});
