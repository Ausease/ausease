import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { clerkClient } from "@clerk/express";
import { db, auditEventsTable, checklistAssignmentsTable, checklistItemsTable, checklistProgressTable, checklistTemplatesTable, checklistVersionsTable, companyDomainsTable, correctiveActionsTable, membershipsTable, operationsRecordsTable, organizationsTable, presenceCheckinsTable, routineDefinitionsTable, routineEvidenceTable, routineInstancesTable, storesTable } from "@workspace/db";
import { requireActiveMembership, requireEnterpriseAuth, requireRole } from "../middleware/auth";
import { writeAuditEvent } from "../lib/audit";
import { persistOperationMutation } from "./operations-persistence";
import { checkStoreGeofence, getChecklistAccess, PRESENCE_WINDOW_MS, validateCoordinates, validateStoreGeofenceInput, type PresenceRole } from "../lib/geofence";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

export const createEnterpriseRouter = (enterpriseAuth: RequestHandler = requireEnterpriseAuth): IRouter => {
const router: IRouter = Router();

router.get("/me", enterpriseAuth, async (req, res) => {
  const context = req.enterprise!;
  const [organization, store, membership] = await Promise.all([
    db.select().from(organizationsTable).where(eq(organizationsTable.id, context.organizationId)).limit(1),
    db.select().from(storesTable).where(and(eq(storesTable.id, context.storeId), eq(storesTable.organizationId, context.organizationId))).limit(1),
    db.select().from(membershipsTable).where(and(eq(membershipsTable.clerkUserId, context.userId), eq(membershipsTable.storeId, context.storeId))).limit(1),
  ]);
  res.json({
    access: membership[0]?.status === "active" || (!membership[0] && process.env.NODE_ENV === "development")
      ? "active"
      : membership[0]?.status === "disabled" ? "disabled"
        : membership[0]?.status === "invited" ? "invitation_required" : "unassigned",
    userId: context.userId,
    organization: organization[0] ? { id: organization[0].id, name: organization[0].name } : null,
    store: store[0] ? { id: store[0].id, name: store[0].name } : null,
    role: membership[0]?.role ?? context.role,
  });
});

router.post("/demo/access", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const expectedCode = process.env.DEMO_ACCESS_CODE;
  const providedCode = typeof req.body?.code === "string" ? req.body.code : "";
  if (!expectedCode) {
    res.status(503).json({ code: "DEMO_ACCESS_UNAVAILABLE", message: "Demo access is not configured." });
    return;
  }
  const expected = Buffer.from(expectedCode);
  const provided = Buffer.from(providedCode);
  const valid = expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!valid) {
    res.status(403).json({ code: "DEMO_ACCESS_DENIED", message: "That demo access code is not valid." });
    return;
  }
  res.json({ allowed: true });
});

router.get("/demo/eligibility", enterpriseAuth, requireActiveMembership, (_req, res) => {
  res.json({ eligible: true });
});

router.get("/presence/status", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  const access = await getChecklistAccess(context);
  res.json(access);
});

router.get("/routines/today", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  await ensureTodayRoutines(context.organizationId, context.storeId);
  const dateKey = todayKey();
  const routines = await db.select({
    id: routineInstancesTable.id, routineId: routineDefinitionsTable.id, name: routineDefinitionsTable.name,
    routineType: routineDefinitionsTable.routineType, dueTime: routineDefinitionsTable.dueTime,
    assignedRole: routineDefinitionsTable.assignedRole, evidenceRequired: routineDefinitionsTable.evidenceRequired,
    status: routineInstancesTable.status, completedAt: routineInstancesTable.completedAt,
    evidenceCount: routineInstancesTable.evidenceCount, escalatedAt: routineInstancesTable.escalatedAt,
  }).from(routineInstancesTable).innerJoin(routineDefinitionsTable, eq(routineInstancesTable.routineDefinitionId, routineDefinitionsTable.id))
    .where(and(eq(routineInstancesTable.organizationId, context.organizationId), eq(routineInstancesTable.storeId, context.storeId), eq(routineInstancesTable.dateKey, dateKey)));
  const overdue = routines.filter((routine) => routine.status !== "completed" && routineStatus(routine.status, routine.dueTime) === "overdue");
  await Promise.all(overdue.map((routine) => db.update(routineInstancesTable).set({ status: "overdue", escalatedAt: new Date(), updatedAt: new Date() }).where(eq(routineInstancesTable.id, routine.id))));
  const evidence = await db.select().from(routineEvidenceTable).where(and(eq(routineEvidenceTable.organizationId, context.organizationId), eq(routineEvidenceTable.storeId, context.storeId)));
  res.json({ dateKey, routines: routines.map((routine) => ({ ...routine, status: routineStatus(routine.status, routine.dueTime), evidence: evidence.filter((item) => item.routineInstanceId === routine.id).map((item) => ({ id: item.id, fileName: item.fileName, contentType: item.contentType, url: `/api/routine-evidence/${item.id}`, createdAt: item.createdAt })) })) });
});

router.post("/routines/:routineId/evidence/upload-url", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  await ensureTodayRoutines(context.organizationId, context.storeId);
  const routineId = String(req.params.routineId);
  const definitionId = routineId.startsWith("default:") ? routineId : `default:${context.organizationId}:${routineId}`;
  const [instance] = await db.select().from(routineInstancesTable).where(and(eq(routineInstancesTable.organizationId, context.organizationId), eq(routineInstancesTable.storeId, context.storeId), eq(routineInstancesTable.routineDefinitionId, definitionId), eq(routineInstancesTable.dateKey, todayKey()))).limit(1);
  if (!instance) { res.status(404).json({ message: "Today's routine was not found." }); return; }
  const fileName = clean(req.body?.fileName) || "routine-evidence.jpg";
  const contentType = clean(req.body?.contentType) || "image/jpeg";
  const size = Number(req.body?.size);
  if (!contentType.startsWith("image/") || !Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) { res.status(400).json({ message: "Evidence must be an image no larger than 10 MB." }); return; }
  try { res.json({ ...(await objectStorage.createUploadUrl()), routineInstanceId: instance.id, fileName, contentType }); }
  catch (error) { res.status(503).json({ message: error instanceof Error ? error.message : "Evidence storage is unavailable." }); }
});

router.post("/routines/:routineId/evidence", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  const objectPath = clean(req.body?.objectPath);
  const fileName = clean(req.body?.fileName) || "routine-evidence.jpg";
  const contentType = clean(req.body?.contentType) || "image/jpeg";
  if (!objectPath.startsWith("/objects/") || !contentType.startsWith("image/")) { res.status(400).json({ message: "A valid uploaded image is required." }); return; }
  const routineId = String(req.params.routineId);
  const definitionId = routineId.startsWith("default:") ? routineId : `default:${context.organizationId}:${routineId}`;
  const [instance] = await db.select().from(routineInstancesTable).where(and(eq(routineInstancesTable.organizationId, context.organizationId), eq(routineInstancesTable.storeId, context.storeId), eq(routineInstancesTable.routineDefinitionId, definitionId), eq(routineInstancesTable.dateKey, todayKey()))).limit(1);
  if (!instance) { res.status(404).json({ message: "Today's routine was not found." }); return; }
  const correctiveActionId = clean(req.body?.correctiveActionId) || null;
  if (correctiveActionId) {
    const [action] = await db.select({ id: correctiveActionsTable.id }).from(correctiveActionsTable).where(and(eq(correctiveActionsTable.id, correctiveActionId), eq(correctiveActionsTable.organizationId, context.organizationId), eq(correctiveActionsTable.storeId, context.storeId))).limit(1);
    if (!action) { res.status(404).json({ message: "Corrective action not found." }); return; }
  }
  try { await objectStorage.getFile(objectPath); } catch { res.status(400).json({ message: "Uploaded evidence could not be found." }); return; }
  const [evidence] = await db.insert(routineEvidenceTable).values({ id: id("evidence"), organizationId: context.organizationId, storeId: context.storeId, routineInstanceId: instance.id, correctiveActionId, objectPath, fileName, contentType, uploadedBy: context.userId }).returning();
  res.status(201).json({ ...evidence, url: `/api/routine-evidence/${evidence.id}` });
});

router.get("/routine-evidence/:evidenceId", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  const [evidence] = await db.select().from(routineEvidenceTable).where(and(eq(routineEvidenceTable.id, String(req.params.evidenceId)), eq(routineEvidenceTable.organizationId, context.organizationId), eq(routineEvidenceTable.storeId, context.storeId))).limit(1);
  if (!evidence) { res.status(404).json({ message: "Evidence not found." }); return; }
  try {
    const file = await objectStorage.getFile(evidence.objectPath);
    res.setHeader("Content-Type", evidence.contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    file.createReadStream().on("error", () => res.destroy()).pipe(res);
  } catch (error) { res.status(error instanceof ObjectNotFoundError ? 404 : 503).json({ message: "Evidence file is unavailable." }); }
});

router.post("/routines/:routineId/complete", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  await ensureTodayRoutines(context.organizationId, context.storeId);
  const evidenceCount = req.body?.evidenceCount === undefined ? 0 : Number(req.body.evidenceCount);
  if (!Number.isInteger(evidenceCount) || evidenceCount < 0) { res.status(400).json({ message: "evidenceCount must be a non-negative integer." }); return; }
  const requestedId = String(req.params.routineId);
  const definitionId = requestedId.startsWith("default:") ? requestedId : `default:${context.organizationId}:${requestedId}`;
  const [definition] = await db.select().from(routineDefinitionsTable).where(and(eq(routineDefinitionsTable.organizationId, context.organizationId), eq(routineDefinitionsTable.id, definitionId))).limit(1);
  if (!definition) { res.status(404).json({ message: "Routine not found." }); return; }
  if (definition.evidenceRequired && evidenceCount < 1) { res.status(422).json({ code: "EVIDENCE_REQUIRED", message: "Add at least one evidence item before completing this routine." }); return; }
  const [updated] = await db.update(routineInstancesTable).set({ status: "completed", completedBy: context.userId, completedAt: new Date(), evidenceCount, updatedAt: new Date() })
    .where(and(eq(routineInstancesTable.organizationId, context.organizationId), eq(routineInstancesTable.storeId, context.storeId), eq(routineInstancesTable.routineDefinitionId, definition.id), eq(routineInstancesTable.dateKey, todayKey()))).returning();
  if (!updated) { res.status(404).json({ message: "Today's routine instance was not found." }); return; }
  await writeAuditEvent(context, "routine.completed", "routine", updated.id, { routineType: definition.routineType, evidenceCount });
  res.json({ ...updated, name: definition.name, routineType: definition.routineType, dueTime: definition.dueTime, evidenceRequired: definition.evidenceRequired });
});

router.post("/corrective-actions", enterpriseAuth, requireActiveMembership, requireRole("manager", "reviewer", "hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const title = clean(req.body?.title);
  if (!title) { res.status(400).json({ message: "A corrective action title is required." }); return; }
  const dueAt = req.body?.dueAt ? new Date(String(req.body.dueAt)) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) { res.status(400).json({ message: "dueAt must be a valid date." }); return; }
  const [action] = await db.insert(correctiveActionsTable).values({
    id: id("action"), organizationId: context.organizationId, storeId: context.storeId,
    sourceIssueId: clean(req.body?.sourceIssueId) || null, sourceRoutineId: clean(req.body?.sourceRoutineId) || null,
    title, ownerClerkUserId: clean(req.body?.ownerClerkUserId) || null, dueAt,
    evidenceRequired: Boolean(req.body?.evidenceRequired), createdBy: context.userId,
  }).returning();
  await writeAuditEvent(context, "corrective_action.created", "corrective_action", action.id, { sourceIssueId: action.sourceIssueId, sourceRoutineId: action.sourceRoutineId });
  res.status(201).json(action);
});

router.patch("/corrective-actions/:actionId", enterpriseAuth, requireActiveMembership, requireRole("manager", "reviewer", "hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const status = req.body?.status === "completed" ? "completed" : req.body?.status === "open" ? "open" : "";
  if (!status) { res.status(400).json({ message: "status must be open or completed." }); return; }
  const [action] = await db.update(correctiveActionsTable)
    .set({ status, completedAt: status === "completed" ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(correctiveActionsTable.id, String(req.params.actionId)), eq(correctiveActionsTable.organizationId, context.organizationId), eq(correctiveActionsTable.storeId, context.storeId)))
    .returning();
  if (!action) { res.status(404).json({ message: "Corrective action not found." }); return; }
  await writeAuditEvent(context, `corrective_action.${status}`, "corrective_action", action.id);
  res.json(action);
});

router.get("/operations/command-center", enterpriseAuth, requireActiveMembership, requireRole("manager", "reviewer", "hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  await ensureTodayRoutines(context.organizationId, context.storeId);
  const [stores, records, instances, actions, evidence] = await Promise.all([
    db.select({ id: storesTable.id, name: storesTable.name }).from(storesTable).where(eq(storesTable.organizationId, context.organizationId)),
    db.select().from(operationsRecordsTable).where(and(eq(operationsRecordsTable.organizationId, context.organizationId), eq(operationsRecordsTable.storeId, context.storeId))),
    db.select().from(routineInstancesTable).where(and(eq(routineInstancesTable.organizationId, context.organizationId), eq(routineInstancesTable.storeId, context.storeId), eq(routineInstancesTable.dateKey, todayKey()))),
    db.select().from(correctiveActionsTable).where(and(eq(correctiveActionsTable.organizationId, context.organizationId), eq(correctiveActionsTable.storeId, context.storeId))),
    db.select().from(routineEvidenceTable).where(and(eq(routineEvidenceTable.organizationId, context.organizationId), eq(routineEvidenceTable.storeId, context.storeId))),
  ]);
  const tasks = records.filter((record) => record.kind === "task").map((record) => record.payload);
  const issues = records.filter((record) => record.kind === "issue").map((record) => record.payload);
  const openActions = actions.filter((action) => action.status !== "completed");
  const hour = new Date().getHours();
  const overdueRoutines = instances.filter((instance) => instance.status !== "completed" && ((instance.id.includes(":sod:") && hour >= 10) || (instance.id.includes(":eod:") && hour >= 18)));
  res.json({
    generatedAt: new Date().toISOString(), store: { id: context.storeId, name: stores.find((store) => store.id === context.storeId)?.name ?? "Current store" },
    metrics: {
      tasksTotal: tasks.length, tasksCompleted: tasks.filter((task) => task.done === true).length,
      openIssues: issues.filter((issue) => issue.status !== "Resolved").length,
      openActions: openActions.length, overdueRoutines: overdueRoutines.length,
      approvalBottlenecks: issues.filter((issue) => issue.status === "In progress").length,
    },
    routines: instances, actions: openActions.slice(0, 10).map((action) => ({ ...action, evidence: evidence.filter((item) => item.correctiveActionId === action.id).map((item) => ({ id: item.id, fileName: item.fileName, contentType: item.contentType, url: `/api/routine-evidence/${item.id}`, createdAt: item.createdAt })) })),
    stores: stores.map((store) => ({ id: store.id, name: store.name, currentStore: store.id === context.storeId })),
  });
});

router.post("/presence/check-in", enterpriseAuth, requireActiveMembership, requireRole("employee", "manager"), async (req, res) => {
  const context = req.enterprise!;
  const coordinates = {
    latitude: Number(req.body?.latitude),
    longitude: Number(req.body?.longitude),
    accuracyMeters: req.body?.accuracyMeters === undefined ? undefined : Number(req.body.accuracyMeters),
  };
  if (!validateCoordinates(coordinates)) {
    res.status(400).json({ code: "INVALID_LOCATION", message: "A valid latitude, longitude, and optional accuracy are required." });
    return;
  }
  const [store] = await db.select({
    id: storesTable.id, name: storesTable.name, latitude: storesTable.latitude,
    longitude: storesTable.longitude, radiusMeters: storesTable.geofenceRadiusMeters, geofenceEnabled: storesTable.geofenceEnabled,
  }).from(storesTable).where(and(
    eq(storesTable.id, context.storeId),
    eq(storesTable.organizationId, context.organizationId),
  )).limit(1);
  if (!store) {
    res.status(409).json({ code: "STORE_GEOFENCE_NOT_CONFIGURED", message: "Your store's location has not been configured yet." });
    return;
  }
  const geofence = checkStoreGeofence(store, coordinates);
  if (geofence.reason === "store_not_configured") {
    res.status(409).json({ code: "STORE_GEOFENCE_NOT_CONFIGURED", message: "Your store's location has not been configured yet." });
    return;
  }
  const distanceMeters = geofence.distanceMeters;
  if (!geofence.allowed) {
    await writeAuditEvent(context, "presence.check_in_denied", "store_presence", context.storeId, {
      reason: "outside_geofence", distanceMeters: Math.round(distanceMeters), accuracyMeters: coordinates.accuracyMeters ?? null,
    });
    res.status(403).json({ code: "OUTSIDE_STORE_GEOFENCE", message: `You are about ${Math.round(distanceMeters)} metres from ${store.name}. Move inside the store to check in.`, distanceMeters, radiusMeters: store.radiusMeters });
    return;
  }
  const role = context.role as PresenceRole;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PRESENCE_WINDOW_MS);
  const presenceId = `presence:${context.organizationId}:${context.storeId}:${context.userId}`;
  await db.insert(presenceCheckinsTable).values({
    id: presenceId, organizationId: context.organizationId, storeId: context.storeId,
    clerkUserId: context.userId, role, latitude: coordinates.latitude, longitude: coordinates.longitude,
    accuracyMeters: coordinates.accuracyMeters ?? null, checkedInAt: now, expiresAt,
  }).onConflictDoUpdate({
    target: presenceCheckinsTable.id,
    set: { role, latitude: coordinates.latitude, longitude: coordinates.longitude, accuracyMeters: coordinates.accuracyMeters ?? null, checkedInAt: now, expiresAt },
  });
  await writeAuditEvent(context, "presence.checked_in", "store_presence", presenceId, {
    distanceMeters: Math.round(distanceMeters), accuracyMeters: coordinates.accuracyMeters ?? null, geofenceEnabled: store.geofenceEnabled, expiresAt: expiresAt.toISOString(),
  });
  res.json({ checkedIn: true, role, expiresAt, distanceMeters: Math.round(distanceMeters), store: { id: store.id, name: store.name, radiusMeters: store.radiusMeters, geofenceEnabled: store.geofenceEnabled } });
});

router.get("/checklists/access", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const access = await getChecklistAccess(req.enterprise!);
  if (!access.allowed) {
    await writeAuditEvent(req.enterprise!, "checklist.access_denied", "checklist", typeof req.query.checklistId === "string" ? req.query.checklistId : undefined, { reason: access.reason });
  }
  res.status(access.allowed ? 200 : 403).json(access);
});

router.get("/checklists", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  const now = new Date();
  const workDate = todayKey();
  const [templates, versions, assignments, items] = await Promise.all([
    db.select().from(checklistTemplatesTable).where(and(eq(checklistTemplatesTable.organizationId, context.organizationId), eq(checklistTemplatesTable.active, true))),
    db.select().from(checklistVersionsTable),
    db.select().from(checklistAssignmentsTable).where(and(eq(checklistAssignmentsTable.organizationId, context.organizationId), eq(checklistAssignmentsTable.storeId, context.storeId))),
    db.select().from(checklistItemsTable),
  ]);
  const visible = templates.flatMap((template) => {
    const candidates = versions
      .filter((version) => version.templateId === template.id && version.status === "published" && (!version.effectiveAt || version.effectiveAt <= now))
      .filter((version) => assignments.some((assignment) => assignment.versionId === version.id && (assignment.role === context.role || assignment.role === "all")))
      .sort((left, right) => right.version - left.version);
    const version = candidates[0];
    if (!version) return [];
    const assignment = assignments.find((item) => item.versionId === version.id && (item.role === context.role || item.role === "all"));
    return [{
      id: template.id,
      versionId: version.id,
      version: version.version,
      name: template.name,
      summary: template.summary,
      owner: template.owner,
      evidenceRule: version.evidenceRule,
      effectiveAt: version.effectiveAt,
      assignedRole: assignment?.role ?? context.role,
      workDate,
      items: items.filter((item) => item.versionId === version.id).sort((left, right) => left.position - right.position)
        .map(({ id, position, title, guidance, required, owner }) => ({ id, position, title, guidance, required, owner, completed: false })),
    }];
  });
  const visibleVersionIds = visible.map((checklist) => checklist.versionId);
  const progress = visibleVersionIds.length === 0 ? [] : await db.select().from(checklistProgressTable).where(and(
    eq(checklistProgressTable.organizationId, context.organizationId),
    eq(checklistProgressTable.storeId, context.storeId),
    eq(checklistProgressTable.clerkUserId, context.userId),
    eq(checklistProgressTable.dateKey, workDate),
    eq(checklistProgressTable.completed, true),
    inArray(checklistProgressTable.versionId, visibleVersionIds),
  ));
  const completedItems = new Set(progress.map((item) => `${item.versionId}:${item.itemId}`));
  res.json({
    checklists: visible.map((checklist) => ({
      ...checklist,
      items: checklist.items.map((item) => ({ ...item, completed: completedItems.has(`${checklist.versionId}:${item.id}`) })),
    })),
  });
});

router.put("/checklists/:checklistId/progress", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  const access = await getChecklistAccess(context);
  if (!access.allowed) {
    await writeAuditEvent(context, "checklist.progress_denied", "checklist", String(req.params.checklistId), { reason: access.reason });
    res.status(403).json({ message: "Checklist access is not ready.", reason: access.reason });
    return;
  }
  const checklistId = String(req.params.checklistId);
  const versionId = clean(req.body?.versionId);
  const itemId = clean(req.body?.itemId);
  const completed = req.body?.completed;
  if (!versionId || !itemId || typeof completed !== "boolean") {
    res.status(400).json({ message: "versionId, itemId, and completed are required." });
    return;
  }
  const now = new Date();
  const [template, version, item, assignment] = await Promise.all([
    db.select().from(checklistTemplatesTable).where(and(
      eq(checklistTemplatesTable.id, checklistId),
      eq(checklistTemplatesTable.organizationId, context.organizationId),
      eq(checklistTemplatesTable.active, true),
    )).limit(1),
    db.select().from(checklistVersionsTable).where(and(
      eq(checklistVersionsTable.id, versionId),
      eq(checklistVersionsTable.templateId, checklistId),
      eq(checklistVersionsTable.status, "published"),
    )).limit(1),
    db.select().from(checklistItemsTable).where(and(
      eq(checklistItemsTable.id, itemId),
      eq(checklistItemsTable.versionId, versionId),
    )).limit(1),
    db.select().from(checklistAssignmentsTable).where(and(
      eq(checklistAssignmentsTable.versionId, versionId),
      eq(checklistAssignmentsTable.organizationId, context.organizationId),
      eq(checklistAssignmentsTable.storeId, context.storeId),
      inArray(checklistAssignmentsTable.role, [context.role, "all"]),
    )).limit(1),
  ]);
  if (!template[0] || !version[0] || !item[0] || !assignment[0] || (version[0].effectiveAt && version[0].effectiveAt > now)) {
    res.status(404).json({ message: "Assigned checklist step not found." });
    return;
  }
  const workDate = todayKey();
  const progressId = `checklist-progress:${context.organizationId}:${context.storeId}:${context.userId}:${versionId}:${workDate}:${itemId}`;
  const completedAt = completed ? now : null;
  const [progress] = await db.insert(checklistProgressTable).values({
    id: progressId,
    organizationId: context.organizationId,
    storeId: context.storeId,
    clerkUserId: context.userId,
    templateId: checklistId,
    versionId,
    itemId,
    dateKey: workDate,
    completed,
    completedAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [
      checklistProgressTable.organizationId,
      checklistProgressTable.storeId,
      checklistProgressTable.clerkUserId,
      checklistProgressTable.versionId,
      checklistProgressTable.dateKey,
      checklistProgressTable.itemId,
    ],
    set: { completed, completedAt, updatedAt: now },
  }).returning();
  await writeAuditEvent(context, completed ? "checklist.step_completed" : "checklist.step_reopened", "checklist", checklistId, {
    versionId, itemId, workDate,
  });
  res.json({
    id: progress.id,
    checklistId,
    versionId,
    itemId,
    workDate,
    completed: progress.completed,
    updatedAt: progress.updatedAt,
  });
});

router.post("/checklists/:checklistId/open", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const access = await getChecklistAccess(req.enterprise!);
  if (!access.allowed) {
    await writeAuditEvent(req.enterprise!, "checklist.open_denied", "checklist", String(req.params.checklistId), { reason: access.reason });
    res.status(403).json({ ...access, checklistId: String(req.params.checklistId) });
    return;
  }
  await writeAuditEvent(req.enterprise!, "checklist.opened", "checklist", String(req.params.checklistId));
  res.json({ ...access, checklistId: String(req.params.checklistId) });
});

router.post("/checklists/:checklistId/submit", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const access = await getChecklistAccess(req.enterprise!);
  if (!access.allowed) {
    await writeAuditEvent(req.enterprise!, "checklist.submit_denied", "checklist", String(req.params.checklistId), { reason: access.reason });
    res.status(403).json({ ...access, checklistId: String(req.params.checklistId) });
    return;
  }
  await writeAuditEvent(req.enterprise!, "checklist.submitted", "checklist", String(req.params.checklistId));
  res.json({ ...access, checklistId: String(req.params.checklistId), submitted: true });
});

const id = (prefix: string) => `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const objectStorage = new ObjectStorageService();
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
const routineDefaults = [
  { id: "sod", name: "Start of Day", routineType: "sod", dueTime: "09:30", assignedRole: "employee", evidenceRequired: true },
  { id: "eod", name: "End of Day", routineType: "eod", dueTime: "18:00", assignedRole: "employee", evidenceRequired: true },
] as const;
async function ensureTodayRoutines(organizationId: string, storeId: string) {
  const dateKey = todayKey();
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const currentMinutes = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  for (const routine of routineDefaults) {
    await db.insert(routineDefinitionsTable).values({
      ...routine, id: `default:${organizationId}:${routine.id}`, organizationId,
    }).onConflictDoNothing();
    await db.insert(routineInstancesTable).values({
      id: `instance:${organizationId}:${storeId}:${routine.id}:${dateKey}`,
      organizationId, storeId, routineDefinitionId: `default:${organizationId}:${routine.id}`, dateKey,
    }).onConflictDoNothing();
    const dueMinutes = Number(routine.dueTime.slice(0, 2)) * 60 + Number(routine.dueTime.slice(3));
    const [instance] = await db.select({ status: routineInstancesTable.status }).from(routineInstancesTable)
      .where(and(eq(routineInstancesTable.organizationId, organizationId), eq(routineInstancesTable.storeId, storeId), eq(routineInstancesTable.routineDefinitionId, `default:${organizationId}:${routine.id}`), eq(routineInstancesTable.dateKey, dateKey))).limit(1);
    if (currentMinutes > dueMinutes && instance?.status !== "completed") {
      await db.update(routineInstancesTable).set({ status: "overdue", escalatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(routineInstancesTable.organizationId, organizationId), eq(routineInstancesTable.storeId, storeId), eq(routineInstancesTable.routineDefinitionId, `default:${organizationId}:${routine.id}`), eq(routineInstancesTable.dateKey, dateKey)));
    }
  }
}
function routineStatus(status: string, dueTime: string) {
  if (status === "completed" || status === "overdue") return status;
  const [hours, minutes] = dueTime.split(":").map(Number);
  const sydneyParts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const currentMinutes = Number(sydneyParts.find((part) => part.type === "hour")?.value ?? 0) * 60
    + Number(sydneyParts.find((part) => part.type === "minute")?.value ?? 0);
  return currentMinutes > hours * 60 + minutes ? "overdue" : "not_started";
}
const domainResponse = (domain: typeof companyDomainsTable.$inferSelect) => {
  const { credentialSecretKey: _secretKey, ...safeDomain } = domain;
  return {
    ...safeDomain,
    secretConfigured: domain.credentialStatus === "configured",
    enabled: domain.enabled === "true",
  };
};

router.get("/admin/provisioning", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const [domains, stores, memberships] = await Promise.all([
    db.select({
      id: companyDomainsTable.id, domain: companyDomainsTable.domain, providerType: companyDomainsTable.providerType,
      providerName: companyDomainsTable.providerName, issuerUrl: companyDomainsTable.issuerUrl,
      clientId: companyDomainsTable.clientId, secretConfigured: companyDomainsTable.secretConfigured,
      credentialStatus: companyDomainsTable.credentialStatus,
      credentialValidationError: companyDomainsTable.credentialValidationError,
      credentialVersion: companyDomainsTable.credentialVersion,
      credentialRotatedAt: companyDomainsTable.credentialRotatedAt,
      enabled: companyDomainsTable.enabled, updatedAt: companyDomainsTable.updatedAt,
    }).from(companyDomainsTable).where(eq(companyDomainsTable.organizationId, context.organizationId)).orderBy(desc(companyDomainsTable.updatedAt)),
    db.select().from(storesTable).where(eq(storesTable.organizationId, context.organizationId)).orderBy(storesTable.name),
    db.select().from(membershipsTable).where(eq(membershipsTable.organizationId, context.organizationId)).orderBy(desc(membershipsTable.updatedAt)),
  ]);
  res.json({
    domains: domains.map((domain) => ({
      ...domain,
      secretConfigured: domain.credentialStatus === "configured",
      enabled: domain.enabled === "true",
    })),
    stores,
    memberships: memberships.map(({ id, organizationId, storeId, clerkUserId, email, role, status, createdAt, updatedAt }) => ({ id, organizationId, storeId, clerkUserId, email, role, status, createdAt, updatedAt })),
  });
});

const checklistRoles = new Set(["employee", "manager", "reviewer", "hq_admin", "all"]);
function checklistInput(body: unknown, fallbackOwner = "") {
  const payload = body as { name?: unknown; summary?: unknown; owner?: unknown; evidenceRule?: unknown; items?: unknown };
  const name = clean(payload?.name);
  const summary = clean(payload?.summary);
  const owner = clean(payload?.owner) || fallbackOwner;
  const evidenceRule = clean(payload?.evidenceRule);
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const items = rawItems.map((item, index) => {
    const value = item as { title?: unknown; guidance?: unknown; required?: unknown; owner?: unknown };
    return {
      position: index + 1,
      title: clean(value?.title),
      guidance: clean(value?.guidance),
      required: value?.required !== false,
      owner: clean(value?.owner) || owner,
    };
  });
  if (!name || !summary || !owner || !evidenceRule || items.length === 0 || items.some((item) => !item.title || !item.guidance || !item.owner)) {
    return null;
  }
  return { name, summary, owner, evidenceRule, items };
}
async function checklistAdminResponse(organizationId: string) {
  const [templates, versions, assignments, items] = await Promise.all([
    db.select().from(checklistTemplatesTable).where(eq(checklistTemplatesTable.organizationId, organizationId)).orderBy(desc(checklistTemplatesTable.createdAt)),
    db.select().from(checklistVersionsTable),
    db.select().from(checklistAssignmentsTable).where(eq(checklistAssignmentsTable.organizationId, organizationId)),
    db.select().from(checklistItemsTable),
  ]);
  return {
    checklists: templates.map((template) => ({
      ...template,
      versions: versions.filter((version) => version.templateId === template.id).sort((left, right) => right.version - left.version).map((version) => ({
        ...version,
        items: items.filter((item) => item.versionId === version.id).sort((left, right) => left.position - right.position),
        assignments: assignments.filter((assignment) => assignment.versionId === version.id),
      })),
    })),
  };
}

router.get("/admin/checklists", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  res.json(await checklistAdminResponse(req.enterprise!.organizationId));
});

router.post("/admin/checklists", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const input = checklistInput(req.body, context.email ?? "");
  if (!input) {
    res.status(400).json({ code: "INVALID_CHECKLIST", message: "Add a name, summary, evidence rule, owner, and at least one complete step." });
    return;
  }
  const templateId = id("checklist-template");
  const versionId = id("checklist-version");
  await db.insert(checklistTemplatesTable).values({
    id: templateId, organizationId: context.organizationId, name: input.name, summary: input.summary,
    owner: input.owner, createdBy: context.userId,
  });
  await db.insert(checklistVersionsTable).values({
    id: versionId, templateId, version: 1, evidenceRule: input.evidenceRule, createdBy: context.userId,
  });
  await db.insert(checklistItemsTable).values(input.items.map((item) => ({ id: id("checklist-item"), versionId, ...item })));
  await writeAuditEvent(context, "checklist.template_created", "checklist_template", templateId, { version: 1, status: "draft" });
  const response = await checklistAdminResponse(context.organizationId);
  res.status(201).json(response.checklists.find((checklist) => checklist.id === templateId));
});

router.post("/admin/checklists/:checklistId/versions", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const templateId = String(req.params.checklistId);
  const [template] = await db.select().from(checklistTemplatesTable).where(and(eq(checklistTemplatesTable.id, templateId), eq(checklistTemplatesTable.organizationId, context.organizationId))).limit(1);
  if (!template) { res.status(404).json({ code: "CHECKLIST_NOT_FOUND", message: "Checklist template not found." }); return; }
  const input = checklistInput({ ...req.body, name: template.name, summary: template.summary, owner: clean(req.body?.owner) || template.owner }, template.owner);
  if (!input) {
    res.status(400).json({ code: "INVALID_CHECKLIST", message: "Add a summary, evidence rule, owner, and at least one complete step." });
    return;
  }
  const [latest] = await db.select({ version: checklistVersionsTable.version }).from(checklistVersionsTable)
    .where(eq(checklistVersionsTable.templateId, templateId)).orderBy(desc(checklistVersionsTable.version)).limit(1);
  const version = (latest?.version ?? 0) + 1;
  const versionId = id("checklist-version");
  await db.insert(checklistVersionsTable).values({ id: versionId, templateId, version, evidenceRule: input.evidenceRule, createdBy: context.userId });
  await db.insert(checklistItemsTable).values(input.items.map((item) => ({ id: id("checklist-item"), versionId, ...item })));
  await db.update(checklistTemplatesTable).set({ summary: input.summary, owner: input.owner }).where(eq(checklistTemplatesTable.id, templateId));
  await writeAuditEvent(context, "checklist.version_created", "checklist_template", templateId, { version, status: "draft" });
  const response = await checklistAdminResponse(context.organizationId);
  res.status(201).json(response.checklists.find((checklist) => checklist.id === templateId));
});

router.post("/admin/checklists/:checklistId/versions/:versionId/publish", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const [version] = await db.select().from(checklistVersionsTable).innerJoin(
    checklistTemplatesTable,
    eq(checklistVersionsTable.templateId, checklistTemplatesTable.id),
  ).where(and(eq(checklistVersionsTable.id, String(req.params.versionId)), eq(checklistTemplatesTable.id, String(req.params.checklistId)), eq(checklistTemplatesTable.organizationId, context.organizationId))).limit(1);
  if (!version) { res.status(404).json({ code: "CHECKLIST_VERSION_NOT_FOUND", message: "Checklist version not found." }); return; }
  if (version.ausease_checklist_versions.status !== "draft") {
    res.status(409).json({ code: "CHECKLIST_VERSION_LOCKED", message: "Published checklist versions are immutable. Create a new version to change the standard." });
    return;
  }
  const storeIds: string[] = Array.isArray(req.body?.storeIds) ? (req.body.storeIds as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  const roles: string[] = Array.isArray(req.body?.roles) ? (req.body.roles as unknown[]).filter((value): value is string => typeof value === "string" && checklistRoles.has(value)) : [];
  if (storeIds.length === 0 || roles.length === 0) {
    res.status(400).json({ code: "INVALID_ASSIGNMENT", message: "Choose at least one store and one role before publishing." });
    return;
  }
  const stores = await db.select({ id: storesTable.id }).from(storesTable).where(and(eq(storesTable.organizationId, context.organizationId), inArray(storesTable.id, storeIds)));
  if (stores.length !== new Set(storeIds).size) {
    res.status(400).json({ code: "INVALID_ASSIGNMENT", message: "Every selected store must belong to your organization." });
    return;
  }
  const effectiveAt = req.body?.effectiveAt ? new Date(String(req.body.effectiveAt)) : new Date();
  if (Number.isNaN(effectiveAt.getTime())) {
    res.status(400).json({ code: "INVALID_EFFECTIVE_DATE", message: "Enter a valid effective date." });
    return;
  }
  const versionId = version.ausease_checklist_versions.id;
  await db.insert(checklistAssignmentsTable).values([...new Set(storeIds)].flatMap((storeId) => [...new Set(roles)].map((role) => ({
    id: id("checklist-assignment"), versionId, organizationId: context.organizationId, storeId, role,
  }))));
  const [published] = await db.update(checklistVersionsTable).set({ status: "published", effectiveAt, publishedAt: new Date() })
    .where(and(eq(checklistVersionsTable.id, versionId), eq(checklistVersionsTable.status, "draft"))).returning();
  if (!published) {
    res.status(409).json({ code: "CHECKLIST_VERSION_LOCKED", message: "This checklist version was already published. Create a new version to change the standard." });
    return;
  }
  await writeAuditEvent(context, "checklist.published", "checklist_template", String(req.params.checklistId), { version: published.version, storeIds, roles, effectiveAt: effectiveAt.toISOString() });
  res.json({ ...published, assignments: await db.select().from(checklistAssignmentsTable).where(eq(checklistAssignmentsTable.versionId, versionId)) });
});

router.post("/admin/domains", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const domain = clean(req.body?.domain).toLowerCase().replace(/^@/, "");
  const providerName = clean(req.body?.providerName);
  const providerType = clean(req.body?.providerType) || "oidc";
  if (!domain || !providerName || !["saml", "oidc", "oauth"].includes(providerType)) {
    res.status(400).json({ message: "A valid domain, provider name, and provider type are required." }); return;
  }
  const record = { id: id("domain"), organizationId: context.organizationId, domain, providerType, providerName,
    issuerUrl: clean(req.body?.issuerUrl) || null, clientId: clean(req.body?.clientId) || null,
    secretConfigured: "false", credentialStatus: "not_configured", enabled: "true" };
  const [created] = await db.insert(companyDomainsTable).values(record).returning();
  await writeAuditEvent(context, "enterprise.domain_added", "company_domain", created.id);
  res.status(201).json(domainResponse(created));
});

router.patch("/admin/domains/:domainId", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const updates: Record<string, string | null> = {};
  if (req.body?.providerName !== undefined) updates.providerName = clean(req.body.providerName);
  if (req.body?.issuerUrl !== undefined) updates.issuerUrl = clean(req.body.issuerUrl) || null;
  if (req.body?.clientId !== undefined) updates.clientId = clean(req.body.clientId) || null;
  if (req.body?.enabled !== undefined) updates.enabled = req.body.enabled ? "true" : "false";
  // Credential readiness is controlled only by the server-side credentials
  // flow. A mobile client cannot mark a provider as configured.
  const [updated] = await db.update(companyDomainsTable).set({ ...updates, updatedAt: new Date() })
    .where(and(eq(companyDomainsTable.id, String(req.params.domainId)), eq(companyDomainsTable.organizationId, context.organizationId))).returning();
  if (!updated) { res.status(404).json({ message: "Domain mapping not found." }); return; }
  await writeAuditEvent(context, "enterprise.domain_updated", "company_domain", updated.id);
  res.json(domainResponse(updated));
});

router.post("/admin/domains/:domainId/credentials", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const secretKey = clean(req.body?.secretKey);
  const keyPattern = /^[A-Z][A-Z0-9_]{2,127}$/;
  if (!secretKey || !keyPattern.test(secretKey)) {
    res.status(400).json({ code: "INVALID_SECRET_KEY", message: "Enter the name of a workspace secret using uppercase letters, numbers, and underscores." });
    return;
  }
  const [domain] = await db.select({ id: companyDomainsTable.id }).from(companyDomainsTable).where(and(
    eq(companyDomainsTable.id, String(req.params.domainId)),
    eq(companyDomainsTable.organizationId, context.organizationId),
  )).limit(1);
  if (!domain) {
    res.status(404).json({ code: "DOMAIN_NOT_FOUND", message: "Domain mapping not found." });
    return;
  }

  // Resolve the value only inside the server process. The mobile client never
  // receives it or submits it. Workspace administrators rotate the value
  // through Replit Secrets while keeping this reference stable.
  const secretAvailable = typeof process.env[secretKey] === "string" && process.env[secretKey]!.length > 0;
  const credentialStatus = secretAvailable ? "configured" : "error";
  const credentialValidationError = secretAvailable ? null : "The workspace secret is not available in this server environment.";
  const [updated] = await db.update(companyDomainsTable).set({
    credentialSecretKey: secretKey,
    credentialStatus,
    credentialValidationError,
    credentialVersion: sql`${companyDomainsTable.credentialVersion} + 1`,
    credentialRotatedAt: new Date(),
    secretConfigured: secretAvailable ? "true" : "false",
    updatedAt: new Date(),
  }).where(and(eq(companyDomainsTable.id, domain.id), eq(companyDomainsTable.organizationId, context.organizationId))).returning();
  await writeAuditEvent(context, secretAvailable ? "enterprise.credentials_configured" : "enterprise.credentials_validation_failed", "company_domain", domain.id, {
    credentialVersion: updated.credentialVersion,
    secretKey,
  });
  res.status(secretAvailable ? 200 : 422).json(domainResponse(updated));
});

router.post("/admin/stores", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const name = clean(req.body?.name);
  if (!name) { res.status(400).json({ message: "Store name is required." }); return; }
  const latitude = req.body?.latitude === undefined ? null : Number(req.body.latitude);
  const longitude = req.body?.longitude === undefined ? null : Number(req.body.longitude);
  const radiusMeters = req.body?.geofenceRadiusMeters === undefined ? 150 : Number(req.body.geofenceRadiusMeters);
  if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) ||
      !Number.isFinite(radiusMeters) || radiusMeters < 25 || radiusMeters > 2000) {
    res.status(400).json({ message: "Store coordinates must be valid and the geofence radius must be between 25 and 2,000 metres." }); return;
  }
  const [store] = await db.insert(storesTable).values({ id: clean(req.body?.id) || id("store"), organizationId: context.organizationId, name, latitude, longitude, geofenceRadiusMeters: radiusMeters }).returning();
  await writeAuditEvent(context, "enterprise.store_added", "store", store.id);
  res.status(201).json(store);
});

router.patch("/admin/stores/:storeId", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);
  const radiusMeters = req.body?.geofenceRadiusMeters === undefined ? undefined : Number(req.body.geofenceRadiusMeters);
  const geofenceEnabled = req.body?.geofenceEnabled === undefined ? undefined : req.body.geofenceEnabled;
  if (!validateStoreGeofenceInput({ latitude, longitude, geofenceRadiusMeters: radiusMeters, geofenceEnabled })) {
    res.status(400).json({ message: "Valid store coordinates are required and the geofence radius must be between 25 and 2,000 metres." }); return;
  }
  const [store] = await db.update(storesTable).set({
    latitude, longitude, ...(radiusMeters === undefined ? {} : { geofenceRadiusMeters: radiusMeters }),
    ...(geofenceEnabled === undefined ? {} : { geofenceEnabled }),
  }).where(and(eq(storesTable.id, String(req.params.storeId)), eq(storesTable.organizationId, context.organizationId))).returning();
  if (!store) { res.status(404).json({ message: "Store not found." }); return; }
  await writeAuditEvent(context, "enterprise.store_geofence_updated", "store", store.id, { radiusMeters: store.geofenceRadiusMeters, geofenceEnabled: store.geofenceEnabled });
  res.json(store);
});

router.post("/admin/memberships", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const email = clean(req.body?.email).toLowerCase();
  const storeId = clean(req.body?.storeId);
  const role = clean(req.body?.role) || "employee";
  if (!email || !storeId || !["employee", "manager", "reviewer", "hq_admin"].includes(role)) {
    res.status(400).json({ message: "Email, store, and a valid role are required." }); return;
  }
  const [store] = await db.select({ id: storesTable.id }).from(storesTable)
    .where(and(eq(storesTable.id, storeId), eq(storesTable.organizationId, context.organizationId))).limit(1);
  if (!store) { res.status(404).json({ message: "Store not found in this organization." }); return; }
  const existing = await db.select({ id: membershipsTable.id }).from(membershipsTable).where(and(
    eq(membershipsTable.organizationId, context.organizationId),
    eq(membershipsTable.storeId, storeId),
    eq(membershipsTable.email, email),
    eq(membershipsTable.status, "invited"),
  )).limit(1);
  const membershipId = existing[0]?.id ?? id("membership");
  const clerkUserId = clean(req.body?.clerkUserId) || `pending:${email}`;
  try {
    const invitation = await clerkClient.invitations.createInvitation({
      emailAddress: email,
      // Keep the membership details with the provider invitation so an
      // accepted invite can be reconciled even before session claims refresh.
      publicMetadata: {
        membershipId,
        organizationId: context.organizationId,
        storeId,
        role,
      },
      ...(process.env.INVITATION_REDIRECT_URL ? { redirectUrl: process.env.INVITATION_REDIRECT_URL } : {}),
      notify: true,
      ignoreExisting: true,
    });
    const [membership] = existing[0]
      ? await db.update(membershipsTable).set({ role, clerkUserId, updatedAt: new Date() })
        .where(and(eq(membershipsTable.id, membershipId), eq(membershipsTable.organizationId, context.organizationId))).returning()
      : await db.insert(membershipsTable).values({
        id: membershipId, organizationId: context.organizationId, storeId, clerkUserId, email, role, status: "invited",
      }).returning();
    await writeAuditEvent(context, "enterprise.membership_invited", "membership", membership.id, {
      invitationId: invitation.id,
      email,
    });
    res.status(201).json({ ...membership, invitationSent: true });
  } catch (error) {
    req.log?.error?.({ err: error, email }, "Failed to send enterprise invitation");
    res.status(502).json({ message: "The invitation could not be sent. No access was provisioned." });
  }
});

router.patch("/admin/memberships/:membershipId", enterpriseAuth, requireActiveMembership, requireRole("hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const updates: Record<string, string> = {};
  if (req.body?.storeId) updates.storeId = clean(req.body.storeId);
  if (req.body?.role) updates.role = clean(req.body.role);
  if (req.body?.status) updates.status = clean(req.body.status);
  if (updates.role && !["employee", "manager", "reviewer", "hq_admin"].includes(updates.role)) { res.status(400).json({ message: "Invalid role." }); return; }
  if (updates.status && !["active", "invited", "disabled"].includes(updates.status)) { res.status(400).json({ message: "Invalid access status." }); return; }
  const [updated] = await db.update(membershipsTable).set({ ...updates, updatedAt: new Date() })
    .where(and(eq(membershipsTable.id, String(req.params.membershipId)), eq(membershipsTable.organizationId, context.organizationId))).returning();
  if (!updated) { res.status(404).json({ message: "Membership not found." }); return; }
  await writeAuditEvent(context, "enterprise.membership_updated", "membership", updated.id);
  res.json(updated);
});

router.get("/audit", enterpriseAuth, requireActiveMembership, requireRole("manager", "reviewer", "hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const events = await db.select({
    id: auditEventsTable.id,
    action: auditEventsTable.action,
    resourceType: auditEventsTable.resourceType,
    resourceId: auditEventsTable.resourceId,
    actorRole: auditEventsTable.actorRole,
    metadata: auditEventsTable.metadata,
    actorClerkUserId: auditEventsTable.actorClerkUserId,
    createdAt: auditEventsTable.createdAt,
  }).from(auditEventsTable)
    .where(and(eq(auditEventsTable.organizationId, context.organizationId), eq(auditEventsTable.storeId, context.storeId)))
    .orderBy(desc(auditEventsTable.createdAt))
    .limit(100);
  res.json({ events });
});

router.get("/operations/snapshot", enterpriseAuth, requireActiveMembership, async (req, res) => {
  const context = req.enterprise!;
  const records = await db.select().from(operationsRecordsTable)
    .where(and(
      eq(operationsRecordsTable.organizationId, context.organizationId),
      eq(operationsRecordsTable.storeId, context.storeId),
      sql`${operationsRecordsTable.kind} in ('task', 'issue', 'message')`,
    ))
    .orderBy(operationsRecordsTable.createdAt);
  const legacy = await db.select().from(operationsRecordsTable)
    .where(and(eq(operationsRecordsTable.organizationId, context.organizationId), eq(operationsRecordsTable.storeId, context.storeId), eq(operationsRecordsTable.kind, "snapshot")))
    .limit(1);
  const grouped = {
    tasks: [...((legacy[0]?.payload?.tasks as unknown[] | undefined) ?? [])],
    issues: [...((legacy[0]?.payload?.issues as unknown[] | undefined) ?? [])],
    messages: [...((legacy[0]?.payload?.messages as unknown[] | undefined) ?? [])],
  };
  for (const record of records) {
    const payload = { ...record.payload, version: record.version };
    const list = record.kind === "task" ? grouped.tasks : record.kind === "issue" ? grouped.issues : grouped.messages;
    const index = list.findIndex((item) => typeof item === "object" && item !== null && (item as { id?: unknown }).id === record.id);
    if (index >= 0) list[index] = payload;
    else list.push(payload);
  }
  res.json(grouped);
});

router.put("/operations/records/:kind/:recordId", enterpriseAuth, requireActiveMembership, requireRole("employee", "manager", "reviewer", "hq_admin"), async (req, res) => {
  const context = req.enterprise!;
  const kind = String(req.params.kind);
  const recordId = String(req.params.recordId);
  if (!["task", "issue", "message"].includes(kind) || !req.body?.payload || typeof req.body.payload !== "object") {
    res.status(400).json({ message: "kind must be task, issue, or message and payload must be an object." });
    return;
  }
  const expectedVersion = req.body.expectedVersion === undefined ? undefined : Number(req.body.expectedVersion);
  if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
    res.status(400).json({ message: "expectedVersion must be a positive integer." });
    return;
  }
  const mutationId = clean(req.body.mutationId) || null;
  const result = await persistOperationMutation(context, {
    kind: kind as "task" | "issue" | "message",
    recordId,
    payload: req.body.payload,
    expectedVersion,
    mutationId,
    source: req.body.source,
  });
  if (result.kind === "idempotent") {
    res.json(result.record);
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({
      message: "This record changed on another device. Review the current version before retrying.",
      conflict: true,
      current: result.current,
    });
    return;
  }
  res.json(result.record);
});

router.put("/operations/snapshot", enterpriseAuth, requireActiveMembership, requireRole("employee", "manager", "reviewer", "hq_admin"), async (req, res) => {
  const body = req.body as { tasks?: unknown; issues?: unknown; messages?: unknown };
  if (!Array.isArray(body?.tasks) || !Array.isArray(body?.issues) || !Array.isArray(body?.messages)) {
    res.status(400).json({ message: "tasks, issues, and messages must be arrays." });
    return;
  }
  const context = req.enterprise!;
  const payload = { tasks: body.tasks, issues: body.issues, messages: body.messages };
  const id = `snapshot:${context.organizationId}:${context.storeId}`;
  await db.insert(operationsRecordsTable).values({
    id,
    organizationId: context.organizationId,
    storeId: context.storeId,
    kind: "snapshot",
    payload,
    createdBy: context.userId,
  }).onConflictDoUpdate({
    target: operationsRecordsTable.id,
    set: { payload, updatedAt: new Date(), createdBy: context.userId },
  });
  await writeAuditEvent(context, "operations.snapshot_saved", "operations_snapshot", id);
  res.json(payload);
});

return router;
};

export default createEnterpriseRouter();