export type DeploymentColumn = {
  table: string;
  column: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
};

export type PublishedColumn = {
  table: string;
  column: string;
};

export type UnexpectedPublishedObject = {
  table: string;
  column?: string;
  kind: "table" | "column";
};

/**
 * The columns that application releases must have in the published database.
 *
 * Keep this list next to the Drizzle declarations. It is intentionally
 * explicit: a schema change should require the release contract to be
 * reviewed, rather than silently shrinking the set of columns being checked.
 */
export const deploymentSchema: readonly DeploymentColumn[] = [
  { table: "ausease_organizations", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_organizations", column: "name", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_organizations", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_stores", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_stores", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_stores", column: "name", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_stores", column: "latitude", dataType: "double precision", nullable: true, defaultValue: null },
  { table: "ausease_stores", column: "longitude", dataType: "double precision", nullable: true, defaultValue: null },
  { table: "ausease_stores", column: "geofence_radius_meters", dataType: "double precision", nullable: false, defaultValue: "150" },
  { table: "ausease_stores", column: "geofence_enabled", dataType: "boolean", nullable: false, defaultValue: "true" },
  { table: "ausease_stores", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_presence_checkins", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_presence_checkins", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_presence_checkins", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_presence_checkins", column: "clerk_user_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_presence_checkins", column: "role", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_presence_checkins", column: "latitude", dataType: "double precision", nullable: false, defaultValue: null },
  { table: "ausease_presence_checkins", column: "longitude", dataType: "double precision", nullable: false, defaultValue: null },
  { table: "ausease_presence_checkins", column: "accuracy_meters", dataType: "double precision", nullable: true, defaultValue: null },
  { table: "ausease_presence_checkins", column: "checked_in_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },
  { table: "ausease_presence_checkins", column: "expires_at", dataType: "timestamp with time zone", nullable: false, defaultValue: null },

  { table: "ausease_routine_definitions", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_definitions", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_definitions", column: "name", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_definitions", column: "routine_type", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_definitions", column: "due_time", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_definitions", column: "assigned_role", dataType: "text", nullable: false, defaultValue: "'employee'" },
  { table: "ausease_routine_definitions", column: "evidence_required", dataType: "boolean", nullable: false, defaultValue: "false" },
  { table: "ausease_routine_definitions", column: "active", dataType: "boolean", nullable: false, defaultValue: "true" },
  { table: "ausease_routine_definitions", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_routine_instances", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_instances", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_instances", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_instances", column: "routine_definition_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_instances", column: "date_key", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_instances", column: "status", dataType: "text", nullable: false, defaultValue: "'not_started'" },
  { table: "ausease_routine_instances", column: "completed_by", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_routine_instances", column: "completed_at", dataType: "timestamp with time zone", nullable: true, defaultValue: null },
  { table: "ausease_routine_instances", column: "evidence_count", dataType: "integer", nullable: false, defaultValue: "0" },
  { table: "ausease_routine_instances", column: "escalated_at", dataType: "timestamp with time zone", nullable: true, defaultValue: null },
  { table: "ausease_routine_instances", column: "updated_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_corrective_actions", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_corrective_actions", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_corrective_actions", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_corrective_actions", column: "source_issue_id", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_corrective_actions", column: "source_routine_id", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_corrective_actions", column: "title", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_corrective_actions", column: "owner_clerk_user_id", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_corrective_actions", column: "due_at", dataType: "timestamp with time zone", nullable: true, defaultValue: null },
  { table: "ausease_corrective_actions", column: "status", dataType: "text", nullable: false, defaultValue: "'open'" },
  { table: "ausease_corrective_actions", column: "evidence_required", dataType: "boolean", nullable: false, defaultValue: "false" },
  { table: "ausease_corrective_actions", column: "completed_at", dataType: "timestamp with time zone", nullable: true, defaultValue: null },
  { table: "ausease_corrective_actions", column: "created_by", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_corrective_actions", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },
  { table: "ausease_corrective_actions", column: "updated_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_routine_evidence", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_evidence", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_evidence", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_evidence", column: "routine_instance_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_evidence", column: "corrective_action_id", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_routine_evidence", column: "object_path", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_evidence", column: "file_name", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_evidence", column: "content_type", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_evidence", column: "uploaded_by", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_routine_evidence", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_checklist_templates", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_templates", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_templates", column: "name", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_templates", column: "summary", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_templates", column: "owner", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_templates", column: "created_by", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_templates", column: "active", dataType: "boolean", nullable: false, defaultValue: "true" },
  { table: "ausease_checklist_templates", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_checklist_versions", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_versions", column: "template_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_versions", column: "version", dataType: "integer", nullable: false, defaultValue: null },
  { table: "ausease_checklist_versions", column: "evidence_rule", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_versions", column: "status", dataType: "text", nullable: false, defaultValue: "'draft'" },
  { table: "ausease_checklist_versions", column: "effective_at", dataType: "timestamp with time zone", nullable: true, defaultValue: null },
  { table: "ausease_checklist_versions", column: "created_by", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_versions", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },
  { table: "ausease_checklist_versions", column: "published_at", dataType: "timestamp with time zone", nullable: true, defaultValue: null },

  { table: "ausease_checklist_items", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_items", column: "version_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_items", column: "position", dataType: "integer", nullable: false, defaultValue: null },
  { table: "ausease_checklist_items", column: "title", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_items", column: "guidance", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_items", column: "required", dataType: "boolean", nullable: false, defaultValue: "true" },
  { table: "ausease_checklist_items", column: "owner", dataType: "text", nullable: false, defaultValue: null },

  { table: "ausease_checklist_assignments", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_assignments", column: "version_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_assignments", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_assignments", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_assignments", column: "role", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_assignments", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_checklist_progress", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_progress", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_progress", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_progress", column: "clerk_user_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_progress", column: "template_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_progress", column: "version_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_progress", column: "item_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_progress", column: "date_key", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_checklist_progress", column: "completed", dataType: "boolean", nullable: false, defaultValue: "false" },
  { table: "ausease_checklist_progress", column: "completed_at", dataType: "timestamp with time zone", nullable: true, defaultValue: null },
  { table: "ausease_checklist_progress", column: "updated_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_memberships", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_memberships", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_memberships", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_memberships", column: "clerk_user_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_memberships", column: "email", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_memberships", column: "role", dataType: "text", nullable: false, defaultValue: "'employee'" },
  { table: "ausease_memberships", column: "status", dataType: "text", nullable: false, defaultValue: "'active'" },
  { table: "ausease_memberships", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },
  { table: "ausease_memberships", column: "updated_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_company_domains", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_company_domains", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_company_domains", column: "domain", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_company_domains", column: "provider_type", dataType: "text", nullable: false, defaultValue: "'oidc'" },
  { table: "ausease_company_domains", column: "provider_name", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_company_domains", column: "issuer_url", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_company_domains", column: "client_id", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_company_domains", column: "secret_configured", dataType: "text", nullable: false, defaultValue: "'false'" },
  { table: "ausease_company_domains", column: "credential_secret_key", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_company_domains", column: "credential_status", dataType: "text", nullable: false, defaultValue: "'not_configured'" },
  { table: "ausease_company_domains", column: "credential_validation_error", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_company_domains", column: "credential_version", dataType: "integer", nullable: false, defaultValue: "0" },
  { table: "ausease_company_domains", column: "credential_rotated_at", dataType: "timestamp with time zone", nullable: true, defaultValue: null },
  { table: "ausease_company_domains", column: "enabled", dataType: "text", nullable: false, defaultValue: "'true'" },
  { table: "ausease_company_domains", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },
  { table: "ausease_company_domains", column: "updated_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_operations_records", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_operations_records", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_operations_records", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_operations_records", column: "kind", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_operations_records", column: "payload", dataType: "jsonb", nullable: false, defaultValue: null },
  { table: "ausease_operations_records", column: "version", dataType: "integer", nullable: false, defaultValue: "1" },
  { table: "ausease_operations_records", column: "mutation_id", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_operations_records", column: "created_by", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_operations_records", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },
  { table: "ausease_operations_records", column: "updated_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },

  { table: "ausease_audit_events", column: "id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_audit_events", column: "organization_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_audit_events", column: "store_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_audit_events", column: "actor_clerk_user_id", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_audit_events", column: "actor_role", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_audit_events", column: "action", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_audit_events", column: "resource_type", dataType: "text", nullable: false, defaultValue: null },
  { table: "ausease_audit_events", column: "resource_id", dataType: "text", nullable: true, defaultValue: null },
  { table: "ausease_audit_events", column: "metadata", dataType: "jsonb", nullable: false, defaultValue: null },
  { table: "ausease_audit_events", column: "created_at", dataType: "timestamp with time zone", nullable: false, defaultValue: "now()" },
];

/**
 * Finds application tables and columns present in a published database but
 * absent from the reviewed deployment contract.
 */
export function findUnexpectedPublishedObjects(
  publishedColumns: readonly PublishedColumn[],
  contract: readonly DeploymentColumn[] = deploymentSchema,
): UnexpectedPublishedObject[] {
  const expectedTables = new Set(contract.map(({ table }) => table));
  const expectedColumns = new Set(contract.map(({ table, column }) => `${table}.${column}`));
  const seen = new Set<string>();
  const unexpected: UnexpectedPublishedObject[] = [];

  for (const { table, column } of publishedColumns) {
    const tableIdentifier = `table:${table}`;
    if (!expectedTables.has(table) && !seen.has(tableIdentifier)) {
      seen.add(tableIdentifier);
      unexpected.push({ table, kind: "table" });
      continue;
    }

    const columnIdentifier = `${table}.${column}`;
    if (expectedTables.has(table) && !expectedColumns.has(columnIdentifier) && !seen.has(columnIdentifier)) {
      seen.add(columnIdentifier);
      unexpected.push({ table, column, kind: "column" });
    }
  }

  return unexpected;
}