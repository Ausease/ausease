import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const organizationsTable = pgTable("ausease_organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const storesTable = pgTable("ausease_stores", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  geofenceRadiusMeters: doublePrecision("geofence_radius_meters").notNull().default(150),
  geofenceEnabled: boolean("geofence_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  organizationIndex: index("ausease_stores_organization_idx").on(table.organizationId),
}));

export const presenceCheckinsTable = pgTable("ausease_presence_checkins", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  clerkUserId: text("clerk_user_id").notNull(),
  role: text("role").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracyMeters: doublePrecision("accuracy_meters"),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => ({
  userStoreUnique: uniqueIndex("ausease_presence_user_store_unique").on(table.clerkUserId, table.storeId),
  storeExpiryIndex: index("ausease_presence_store_expiry_idx").on(table.storeId, table.expiresAt),
}));

export const routineDefinitionsTable = pgTable("ausease_routine_definitions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  routineType: text("routine_type").notNull(),
  dueTime: text("due_time").notNull(),
  assignedRole: text("assigned_role").notNull().default("employee"),
  evidenceRequired: boolean("evidence_required").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  organizationIndex: index("ausease_routines_organization_idx").on(table.organizationId),
}));

export const checklistTemplatesTable = pgTable("ausease_checklist_templates", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  summary: text("summary").notNull(),
  owner: text("owner").notNull(),
  createdBy: text("created_by").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  organizationIndex: index("ausease_checklist_templates_organization_idx").on(table.organizationId),
}));

export const checklistVersionsTable = pgTable("ausease_checklist_versions", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull().references(() => checklistTemplatesTable.id),
  version: integer("version").notNull(),
  evidenceRule: text("evidence_rule").notNull(),
  status: text("status").notNull().default("draft"),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  templateVersionUnique: uniqueIndex("ausease_checklist_template_version_unique").on(table.templateId, table.version),
  templateIndex: index("ausease_checklist_versions_template_idx").on(table.templateId),
}));

export const checklistItemsTable = pgTable("ausease_checklist_items", {
  id: text("id").primaryKey(),
  versionId: text("version_id").notNull().references(() => checklistVersionsTable.id),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  guidance: text("guidance").notNull(),
  required: boolean("required").notNull().default(true),
  owner: text("owner").notNull(),
}, (table) => ({
  versionPositionUnique: uniqueIndex("ausease_checklist_item_position_unique").on(table.versionId, table.position),
  versionIndex: index("ausease_checklist_items_version_idx").on(table.versionId),
}));

export const checklistAssignmentsTable = pgTable("ausease_checklist_assignments", {
  id: text("id").primaryKey(),
  versionId: text("version_id").notNull().references(() => checklistVersionsTable.id),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  assignmentUnique: uniqueIndex("ausease_checklist_assignment_unique").on(table.versionId, table.storeId, table.role),
  storeIndex: index("ausease_checklist_assignments_store_idx").on(table.organizationId, table.storeId),
}));

export const checklistProgressTable = pgTable("ausease_checklist_progress", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  clerkUserId: text("clerk_user_id").notNull(),
  templateId: text("template_id").notNull().references(() => checklistTemplatesTable.id),
  versionId: text("version_id").notNull().references(() => checklistVersionsTable.id),
  itemId: text("item_id").notNull().references(() => checklistItemsTable.id),
  dateKey: text("date_key").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  itemScopeUnique: uniqueIndex("ausease_checklist_progress_item_scope_unique").on(
    table.organizationId, table.storeId, table.clerkUserId, table.versionId, table.dateKey, table.itemId,
  ),
  userDateIndex: index("ausease_checklist_progress_user_date_idx").on(
    table.organizationId, table.storeId, table.clerkUserId, table.dateKey,
  ),
  versionDateIndex: index("ausease_checklist_progress_version_date_idx").on(table.versionId, table.dateKey),
}));

export const routineInstancesTable = pgTable("ausease_routine_instances", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  routineDefinitionId: text("routine_definition_id").notNull().references(() => routineDefinitionsTable.id),
  dateKey: text("date_key").notNull(),
  status: text("status").notNull().default("not_started"),
  completedBy: text("completed_by"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  evidenceCount: integer("evidence_count").notNull().default(0),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  routineStoreDateUnique: uniqueIndex("ausease_routine_instance_store_date_unique").on(table.routineDefinitionId, table.storeId, table.dateKey),
  storeDateIndex: index("ausease_routine_instance_store_date_idx").on(table.storeId, table.dateKey),
}));

export const correctiveActionsTable = pgTable("ausease_corrective_actions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  sourceIssueId: text("source_issue_id"),
  sourceRoutineId: text("source_routine_id"),
  title: text("title").notNull(),
  ownerClerkUserId: text("owner_clerk_user_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status").notNull().default("open"),
  evidenceRequired: boolean("evidence_required").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  storeStatusIndex: index("ausease_corrective_actions_store_status_idx").on(table.storeId, table.status),
}));

export const routineEvidenceTable = pgTable("ausease_routine_evidence", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  routineInstanceId: text("routine_instance_id").notNull().references(() => routineInstancesTable.id),
  correctiveActionId: text("corrective_action_id"),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  routineIndex: index("ausease_routine_evidence_instance_idx").on(table.routineInstanceId),
  scopeIndex: index("ausease_routine_evidence_scope_idx").on(table.organizationId, table.storeId),
}));

export const membershipsTable = pgTable("ausease_memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  clerkUserId: text("clerk_user_id").notNull(),
  email: text("email"),
  role: text("role").notNull().default("employee"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userStoreUnique: uniqueIndex("ausease_membership_user_store_unique").on(table.clerkUserId, table.storeId),
  organizationIndex: index("ausease_memberships_organization_idx").on(table.organizationId),
  userIndex: index("ausease_memberships_user_idx").on(table.clerkUserId),
}));

export const companyDomainsTable = pgTable("ausease_company_domains", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  domain: text("domain").notNull(),
  providerType: text("provider_type").notNull().default("oidc"),
  providerName: text("provider_name").notNull(),
  issuerUrl: text("issuer_url"),
  clientId: text("client_id"),
  secretConfigured: text("secret_configured").notNull().default("false"),
  credentialSecretKey: text("credential_secret_key"),
  credentialStatus: text("credential_status").notNull().default("not_configured"),
  credentialValidationError: text("credential_validation_error"),
  credentialVersion: integer("credential_version").notNull().default(0),
  credentialRotatedAt: timestamp("credential_rotated_at", { withTimezone: true }),
  enabled: text("enabled").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  domainUnique: uniqueIndex("ausease_company_domain_unique").on(table.organizationId, table.domain),
  organizationIndex: index("ausease_company_domains_organization_idx").on(table.organizationId),
}));

export const operationsRecordsTable = pgTable("ausease_operations_records", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  version: integer("version").notNull().default(1),
  mutationId: text("mutation_id"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  storeKindIndex: index("ausease_records_store_kind_idx").on(table.storeId, table.kind),
}));

export const auditEventsTable = pgTable("ausease_audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizationsTable.id),
  storeId: text("store_id").notNull().references(() => storesTable.id),
  actorClerkUserId: text("actor_clerk_user_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  organizationCreatedIndex: index("ausease_audit_org_created_idx").on(table.organizationId, table.createdAt),
  storeCreatedIndex: index("ausease_audit_store_created_idx").on(table.storeId, table.createdAt),
}));

/**
 * Every application table must be represented in deploymentSchema with the
 * critical columns that releases depend on.
 */
export const applicationTables = [
  organizationsTable,
  storesTable,
  presenceCheckinsTable,
  routineDefinitionsTable,
  checklistTemplatesTable,
  checklistVersionsTable,
  checklistItemsTable,
  checklistAssignmentsTable,
  checklistProgressTable,
  routineInstancesTable,
  correctiveActionsTable,
  routineEvidenceTable,
  membershipsTable,
  companyDomainsTable,
  operationsRecordsTable,
  auditEventsTable,
] as const;

export type Organization = typeof organizationsTable.$inferSelect;
export type Store = typeof storesTable.$inferSelect;
export type PresenceCheckin = typeof presenceCheckinsTable.$inferSelect;
export type RoutineDefinition = typeof routineDefinitionsTable.$inferSelect;
export type ChecklistTemplate = typeof checklistTemplatesTable.$inferSelect;
export type ChecklistVersion = typeof checklistVersionsTable.$inferSelect;
export type ChecklistItem = typeof checklistItemsTable.$inferSelect;
export type ChecklistAssignment = typeof checklistAssignmentsTable.$inferSelect;
export type ChecklistProgress = typeof checklistProgressTable.$inferSelect;
export type RoutineInstance = typeof routineInstancesTable.$inferSelect;
export type CorrectiveAction = typeof correctiveActionsTable.$inferSelect;
export type RoutineEvidence = typeof routineEvidenceTable.$inferSelect;
export type Membership = typeof membershipsTable.$inferSelect;
export type CompanyDomain = typeof companyDomainsTable.$inferSelect;
export type OperationsRecord = typeof operationsRecordsTable.$inferSelect;
export type AuditEvent = typeof auditEventsTable.$inferSelect;