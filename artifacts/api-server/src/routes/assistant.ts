import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { correctiveActionsTable, db, operationsRecordsTable, routineDefinitionsTable, routineInstancesTable } from "@workspace/db";
import { requireActiveMembership, requireEnterpriseAuth } from "../middleware/auth";
import { writeAuditEvent } from "../lib/audit";

const router: IRouter = Router();
type AssistantTask = {
  id: string; title: string; area: string; due: string; done: boolean;
  priority?: "high" | "normal"; assignee?: string;
};
type AssistantIssue = {
  id: string; title: string; area: string; status: "Open" | "In progress" | "Resolved";
  time: string; urgent?: boolean;
};
type AssistantRequest = {
  request: string; confirmed?: boolean; tasks?: AssistantTask[]; issues?: AssistantIssue[];
};
type TranscriptionRequest = { audioBase64?: unknown; mimeType?: unknown };
type TranscriptionProviderResponse = { text?: unknown; error?: { message?: unknown } };
type Intent = "answer" | "create_task" | "summarize_issues" | "operations_summary" | "sop_guidance" | "clarify";
const auditTrail: Array<{ id: string; request: string; intent: Intent; createdAt: string; mentions: string[] }> = [];

const MAX_AUDIO_BASE64_LENGTH = 12_000_000;
const TRANSCRIPTION_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRANSCRIPTIONS_PER_WINDOW = 8;
const supportedAudioTypes = new Map([
  ["audio/aac", "aac"],
  ["audio/flac", "flac"],
  ["audio/m4a", "m4a"],
  ["audio/mp4", "mp4"],
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/webm", "webm"],
]);
const transcriptionAttempts = new Map<string, { startedAt: number; count: number }>();

const names = ["Alex", "Mia", "Jordan", "Sam", "Taylor", "Chris"];
const displayName = (value: string) => value.replace(/^\w/, (letter) => letter.toUpperCase());
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function parseRequest(body: unknown): AssistantRequest {
  if (!body || typeof body !== "object" || typeof (body as { request?: unknown }).request !== "string") {
    throw new Error("request must be a non-empty string");
  }
  const value = body as AssistantRequest;
  if (!value.request.trim()) throw new Error("request must be a non-empty string");
  return value;
}

function parseAssignee(text: string): string | undefined {
  const knownName = names.find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  if (knownName) return knownName;
  const match = text.match(/\b(?:to|for|assign(?:ed)?\s+to|give|delegate)\s+([a-z]+)\b/i);
  if (!match || /^(the|team|everyone|someone|anyone|whoever)$/i.test(match[1])) return undefined;
  return displayName(match[1]);
}

function parseTaskTitle(text: string): string {
  const stripped = text
    .replace(/^(?:could you please|please|can you|would you|i need you to)\s+/i, "")
    .replace(/^(?:please\s+)?(?:can you\s+)?(?:assign|give|add|create|make)\b/i, "")
    .replace(/\b(?:to|for)\s+[a-z]+\b/i, "")
    .replace(/\b(?:Alex|Mia|Jordan|Sam|Taylor|Chris)\b/gi, "")
    .replace(/\b(?:the|a)\b/i, "")
    .replace(/\b(?:checklist|task)\b/i, "")
    .replace(/\s+/g, " ").trim();
  const title = stripped || "Store operations follow-up";
  const normalizedTitle = title.replace(/[?.!,]+$/, "");
  return `${normalizedTitle.charAt(0).toUpperCase()}${normalizedTitle.slice(1)}${/check|walk|count|upload|review/i.test(normalizedTitle) ? "" : " checklist"}`;
}

function parseDetails(text: string) {
  const lower = text.toLowerCase();
  const due = /\b(tomorrow)\b/i.test(text) ? "Due tomorrow" :
    /\b(?:at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i.exec(text)?.[1] ? `Due ${/\b(?:at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i.exec(text)?.[1]}` :
    /\b(today|tonight|this morning|this afternoon)\b/i.test(text) ? "Due today" : "Due today";
  const storeMatch = text.match(/\b(?:at|for)\s+(?:the\s+)?([A-Za-z][A-Za-z ]+?)\s+(?:store|location)\b/i);
  return {
    area: storeMatch ? `${displayName(storeMatch[1].trim())} store` : "Store operations",
    due,
    priority: /\b(urgent|asap|high priority|priority)\b/.test(lower) ? "high" as const : "normal" as const,
  };
}

function getAudioType(value: unknown): { mimeType: string; extension: string } | null {
  const mimeType = typeof value === "string" && value.trim() ? value.split(";")[0].trim().toLowerCase() : "audio/mp4";
  const extension = supportedAudioTypes.get(mimeType);
  return extension ? { mimeType, extension } : null;
}

function decodeAudio(audioBase64: string): Buffer | null {
  const payload = audioBase64.replace(/^data:audio\/[^;]+;base64,/, "");
  if (!payload || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 === 1) return null;
  const audio = Buffer.from(payload, "base64");
  return audio.length ? audio : null;
}

async function transcribeWithOpenAI(audio: Buffer, audioType: { mimeType: string; extension: string }): Promise<string> {
  const baseUrl = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!baseUrl || !apiKey) {
    throw new Error("Secure speech transcription is not configured for this workspace yet.");
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: audioType.mimeType }), `voice-request.${audioType.extension}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("response_format", "json");

  const providerResponse = await fetch(`${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const result = await providerResponse.json().catch(() => ({})) as TranscriptionProviderResponse;
  if (!providerResponse.ok) {
    throw new Error(typeof result.error?.message === "string" ? result.error.message : "The speech provider rejected the recording.");
  }
  if (typeof result.text !== "string" || !result.text.trim()) {
    throw new Error("The speech provider returned no transcript.");
  }
  return result.text.trim();
}

function transcriptionLimitReached(clientKey: string): boolean {
  const now = Date.now();
  const attempt = transcriptionAttempts.get(clientKey);
  if (!attempt || now - attempt.startedAt >= TRANSCRIPTION_WINDOW_MS) {
    transcriptionAttempts.set(clientKey, { startedAt: now, count: 1 });
    return false;
  }
  attempt.count += 1;
  return attempt.count > MAX_TRANSCRIPTIONS_PER_WINDOW;
}

router.post("/assistant/transcribe", requireEnterpriseAuth, requireActiveMembership, async (req, res) => {
  const body = req.body as TranscriptionRequest;
  if (typeof body?.audioBase64 !== "string" || body.audioBase64.length < 100) {
    res.status(400).json({ message: "A recorded audio payload is required." });
    return;
  }
  if (body.audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
    res.status(413).json({ message: "That recording is too large. Please record a shorter request." });
    return;
  }
  const audioType = getAudioType(body.mimeType);
  if (!audioType) {
    res.status(415).json({ message: "That audio format is not supported. Please record again or type the request instead." });
    return;
  }
  const audio = decodeAudio(body.audioBase64);
  if (!audio) {
    res.status(400).json({ message: "The recorded audio payload is invalid. Please record again or type the request instead." });
    return;
  }
  if (transcriptionLimitReached(req.ip ?? "unknown-client")) {
    res.status(429).json({ message: "Too many voice requests were sent. Please wait a few minutes or type the request instead." });
    return;
  }
  const configured = Boolean(process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] && process.env["AI_INTEGRATIONS_OPENAI_API_KEY"]);
  if (!configured) {
    res.status(503).json({ message: "Secure speech transcription is not configured for this workspace yet. Please type the request instead." });
    return;
  }
  try {
    res.json({ transcript: await transcribeWithOpenAI(audio, audioType) });
  } catch (error) {
    req.log.warn({ err: error }, "Speech provider transcription failed");
    res.status(502).json({ message: "The speech service could not transcribe that recording. Please try again or type the request." });
  }
});

router.post("/assistant", requireEnterpriseAuth, requireActiveMembership, async (req, res) => {
  let input: AssistantRequest;
  try {
    input = parseRequest(req.body);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Invalid request" });
    return;
  }
  const text = input.request.trim();
  const lower = text.toLowerCase();
  const tasks = input.tasks ?? [];
  const issues = input.issues ?? [];
  let intent: Intent = "clarify";
  let message = "I can check tasks, summarize issues, find SOP guidance, or create a task thread. What would you like me to do?";
  let task: AssistantTask | null = null;
  let mentions: string[] = [];
  let confirmationRequired = false;

  const asksForTask = /\b(assign|give|add|create|make|remind|delegate|have)\b/.test(lower) &&
    /\b(task|checklist|walk|check|count|review|upload|cover|do)\b/.test(lower);
  if (asksForTask) {
    intent = "create_task";
    const assignee = parseAssignee(text);
    const title = parseTaskTitle(text);
    const details = parseDetails(text);
    const unsafe = /\b(delete|remove|close|resolve|cancel|fire|discipline)\b/.test(lower);
    if (!assignee || unsafe) {
      confirmationRequired = true;
      message = !assignee
        ? `Who should I assign “${title}” to? Please name one team member before I create the thread.`
        : `This request could change or remove operational records. Please confirm that you want me to proceed with “${title}” for ${assignee}.`;
    } else if (!input.confirmed && /\b(?:everyone|someone|whoever|anyone|team)\b/.test(lower)) {
      confirmationRequired = true;
      message = `I can create “${title}” for ${assignee}, but I need your confirmation before assigning work.`;
    } else {
      task = { id: makeId(), title, ...details, done: false, assignee };
      mentions = [assignee];
      message = `Done — I created a task thread for ${assignee} and mentioned them: “${title}”. It’s due today and is now in the team task list.`;
    }
  } else if (/\b(issue|issues|incident|problem|broken|freezer|light)\b/.test(lower) && /\b(open|summar|status|show|list|report)\b/.test(lower)) {
    intent = "summarize_issues";
    const open = issues.filter((issue) => issue.status !== "Resolved");
    message = open.length
      ? `There ${open.length === 1 ? "is" : "are"} ${open.length} open issue${open.length === 1 ? "" : "s"}: ${open.map((issue) => `${issue.title} (${issue.status})`).join("; ")}.`
      : "There are no open issues in the store right now.";
  } else if (/\b(pending|open|outstanding|unfinished|left to do|tasks?)\b/.test(lower) && !/\b(assign|create|add)\b/.test(lower)) {
    intent = "answer";
    const pending = tasks.filter((item) => !item.done);
    message = pending.length
      ? `You have ${pending.length} pending task${pending.length === 1 ? "" : "s"}: ${pending.map((item) => item.title).join(", ")}.`
      : "You have no pending tasks in the store today.";
  } else if (/\b(sop|how do i|how can i|what should i do|procedure|playbook|guide|standard|handle|deal with)\b/.test(lower) &&
    /\b(freezer|temperature|safety|opening|closing|delivery|stock)\b/.test(lower)) {
    intent = "sop_guidance";
    message = /\b(freezer|temperature|cold)\b/.test(lower)
      ? "SOP guidance: isolate the affected freezer, record the temperature, move at-risk stock, and notify the duty manager and maintenance. I can create a follow-up task if you name an owner."
      : "SOP guidance: follow the store playbook for the relevant area, record the check in the task thread, and escalate safety or stock risks to the duty manager.";
  } else if (/\b(start of day|opening routine|end of day|closing routine|overdue|compliance|store performance|routine status)\b/.test(lower)) {
    intent = "operations_summary";
    const context = req.enterprise!;
    const [routines, actions] = await Promise.all([
      db.select({ name: routineDefinitionsTable.name, routineType: routineDefinitionsTable.routineType, dueTime: routineDefinitionsTable.dueTime, status: routineInstancesTable.status })
        .from(routineInstancesTable).innerJoin(routineDefinitionsTable, eq(routineInstancesTable.routineDefinitionId, routineDefinitionsTable.id))
        .where(and(eq(routineInstancesTable.organizationId, context.organizationId), eq(routineInstancesTable.storeId, context.storeId))),
      db.select({ title: correctiveActionsTable.title, status: correctiveActionsTable.status }).from(correctiveActionsTable)
        .where(and(eq(correctiveActionsTable.organizationId, context.organizationId), eq(correctiveActionsTable.storeId, context.storeId), eq(correctiveActionsTable.status, "open"))),
    ]);
    const pendingRoutines = routines.filter((routine) => routine.status !== "completed");
    message = `Operations snapshot: ${pendingRoutines.length} routine${pendingRoutines.length === 1 ? "" : "s"} still need attention (${pendingRoutines.map((routine) => `${routine.name} due ${routine.dueTime}`).join(", ") || "none"}). There ${actions.length === 1 ? "is" : "are"} ${actions.length} open corrective action${actions.length === 1 ? "" : "s"}.`;
  }

  const auditId = makeId();
  auditTrail.push({ id: auditId, request: text, intent, createdAt: new Date().toISOString(), mentions });
  const context = req.enterprise!;
  await writeAuditEvent(context, "assistant.requested", "assistant_request", auditId, { intent, mentions });
  if (task) {
    (req.app.locals.operationsTasks ??= []).push(task);
    await db.insert(operationsRecordsTable).values({
      id: task.id,
      organizationId: context.organizationId,
      storeId: context.storeId,
      kind: "task",
      payload: task as unknown as Record<string, unknown>,
      createdBy: context.userId,
    });
    await writeAuditEvent(context, "task.created", "task", task.id, { title: task.title, assignee: task.assignee });
  }
  res.json({ message, intent, confirmationRequired, task, mentions, auditId });
});

export default router;