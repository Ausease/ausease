# ausease — Complete Feature List and Workflows

**Product:** ausease retail operations platform  
**Document date:** 30 August 2026  
**Platforms:** Mobile-first app with web preview, supported by an authenticated API service  
**Purpose:** Give store teams, managers, reviewers, and headquarters one accountable place to run daily retail operations.

---

## 1. Product Summary

ausease is a multi-store operations app for turning operating standards into daily action. It combines tasks, written checklists, routines, evidence photos, issue management, team communication, reporting, audit history, and an operations AI assistant.

The product is designed around five principles:

1. **The right work reaches the right store and role.**
2. **Evidence and audit history make completion accountable.**
3. **Frontline workflows remain fast and mobile-first.**
4. **Headquarters can publish standards without changing completed history.**
5. **Every live request is protected by identity, membership, tenant, store, and role checks.**

---

## 2. User Roles

### Store Team Member

- Views work assigned to their store and role.
- Completes daily tasks and routines.
- Reviews written checklist steps and guidance.
- Adds required evidence photos.
- Reports operational issues.
- Participates in store Team Chat.
- Uses ausease AI Chat for operational help and supported actions.
- Checks in at the store when location verification is required.

### Store Manager

- Has the store team member workflow.
- Views the Operations Command Center.
- Reviews open issues, overdue routines, and approval bottlenecks.
- Creates and completes corrective actions.
- Reviews audit history for the store.
- Participates in presence verification for controlled checklist access.

### Regional Reviewer

- Reviews store performance and exceptions.
- Sees command-center metrics and overdue work.
- Reviews evidence and corrective actions.
- Can update corrective-action status.
- Reviews audit history.
- Is restricted to the assigned organization and store context.

### Headquarters Administrator

- Manages stores, memberships, domains, identity-provider settings, and access.
- Creates checklist templates.
- Creates immutable checklist versions.
- Publishes versions to selected stores and roles with an effective date.
- Reviews organization-level operational and audit data.
- Configures store geofence settings.

### Read-only Viewer

- Available in the local demo workspace.
- Can browse all primary screens and realistic operating data.
- Cannot change tasks, issues, checklists, chat, profile access, or settings.
- Uses the production employee role shape without adding an unsupported live role.

---

## 3. Authentication and Access

### Clerk Authentication

- Email and password sign-in.
- Email-code verification when the device or session needs additional trust.
- Additional verification support for sign-ins that require a second factor.
- Single sign-on entry point.
- Automatic routing when an active session already exists.
- Sign-out and session-aware navigation.

### Ausease Membership

Clerk identifies the person, while ausease determines what the person can access.

Each live user must have:

- A valid Clerk session.
- An ausease organization membership.
- An assigned store.
- An active membership status.
- A supported role.

Membership states include:

- Active.
- Invited / invitation required.
- Disabled.
- Unassigned.

### Authorization Boundaries

- Organization and store identifiers must both match.
- Role checks are applied to protected manager, reviewer, and HQ actions.
- Inactive, invited, disabled, expired, or anonymous sessions cannot mutate operations.
- Cross-store access is blocked.
- Evidence files are served only inside the authenticated organization and store scope.

---

## 4. Navigation and Mobile Experience

### Bottom Navigation

The primary bottom navigation contains:

- Home.
- Tasks.
- Issues.
- Team Chat.
- AI Chat.
- Menu.

### Sliding Menu

The Menu button opens an animated bottom sheet instead of using a full “More” tab.

The slider provides:

- Current demo profile context when demo mode is active.
- Control Room access.
- Store Settings access.
- Backdrop and close controls.
- Mobile-safe spacing for device bottom insets.

### Shared Screen Experience

- ausease visual branding and lowercase wordmark.
- Mobile-first cards, status pills, operational metrics, and clear calls to action.
- Safe-area support.
- Light and dark color support through shared design tokens.
- Loading, error, permission, read-only, and unavailable states.

---

## 5. Home and Store Pulse

### Store Header

- Personalized greeting.
- Current store or regional workspace.
- Current shift information.
- Live store status indicator.

### Today at a Glance

- Completed tasks versus total tasks.
- Open issue count.
- Team-online count.

### Operations Command Center

Visible to managers, reviewers, and headquarters administrators.

Includes:

- Tasks completed and total.
- Open issues.
- Open corrective actions.
- Overdue routines.
- Approval bottlenecks.
- Current store context.
- Store list for organization-level views.

### Quick Actions

- Open My Tasks.
- Report an Issue.
- Open Team Chat.
- Ask ausease.

### Needs Attention

- Prioritized unresolved issues.
- Urgency indicators.
- Direct navigation to issue management.

---

## 6. Tasks and Daily Operations

### Shift Progress

- Completed-task count.
- Completion percentage.
- Visual progress indicator.
- Remaining work summary.

### Task Management

- Task title, operational area, due time, assignee, and priority.
- Complete and reopen tasks.
- High-priority indicators.
- Read-only protection where required.
- Local optimistic state with server synchronization.

### Daily Routines

- Start-of-day and end-of-day routines.
- Due times.
- Not started, completed, and overdue states.
- Automatic overdue detection.
- Evidence-required indicators.
- Completion timestamps and evidence counts.

### Written Checklists

Each checklist can contain:

- Checklist name.
- Summary and intended outcome.
- Owner.
- Version number.
- Effective date.
- Evidence rule.
- Assigned stores.
- Assigned roles.
- Ordered steps.
- Step title.
- Detailed guidance.
- Required or optional status.
- Completion state.

### Published Checklist Visibility

- Only active checklist templates are considered.
- Only published versions are available to frontline users.
- Future versions remain hidden until their effective date.
- Only the latest effective version of each template is shown.
- The user must match the assigned store.
- The user’s role must match the assignment, or the assignment must target all roles.

### New Operating Standard Notice

When a new checklist version takes effect:

- Assigned users see an in-app notice in Tasks.
- The notice includes the checklist name.
- The notice includes the version number.
- The notice includes the effective date.
- The notice includes the owner.
- Notices are scoped by user, store, role, template, and version.
- A user can dismiss a notice.
- Dismissal is stored locally on the device.
- A later version creates a new notice even if the previous version was dismissed.

---

## 7. Store Presence and Geofence Controls

### Store Check-in

- Requests device location permission.
- Validates latitude and longitude.
- Records optional location accuracy.
- Measures the distance from the configured store.
- Shows the store radius and check-in result.
- Creates a time-limited presence record.

### Access Rules

Checklist access can require:

- A configured store location.
- The team member to be checked in.
- A manager to be checked in.
- The person to be inside the allowed radius.

### Permission Recovery

- Clear guidance when location permission is missing.
- Clear distinction between temporary denial and revoked permission.
- Camera permission recovery can open device Settings.
- Location verification can be paused by an HQ administrator without deleting store configuration.

### Store Settings

Headquarters administrators can:

- Set store latitude and longitude.
- Set the allowed radius.
- Enable or pause geofence enforcement.
- Review configuration status.
- Preserve an audit trail for setting changes.

---

## 8. Evidence Photos and Offline Reliability

### Evidence Capture

- Requests camera permission.
- Opens the native camera.
- Captures image evidence.
- Validates supported image content and maximum size.
- Requests a secure upload URL.
- Uploads the image to object storage.
- Registers the uploaded evidence against the routine.
- Completes the routine with the evidence reference.

### Protected Evidence Access

- Evidence is linked to organization, store, routine, uploader, and optional corrective action.
- Evidence retrieval requires a matching authenticated organization and store.
- Responses use private cache controls.

### Offline Evidence Queue

- Failed evidence uploads are saved locally.
- Captured files are copied to durable device storage when possible.
- Repeated callbacks for the same evidence are coalesced.
- Pending evidence is separated by user and store.
- Sync retries when the app returns to the foreground.
- Accepted uploads are removed from the queue.
- Temporary failures remain queued.
- Unavailable local files are removed with a clear user message.
- Concurrent retries share work instead of uploading duplicates.

---

## 9. Issues and Corrective Actions

### Issue Reporting

- Create a store issue.
- Add title and operational area.
- Mark urgent exceptions.
- View Open, In Progress, and Resolved states.
- See when an issue was raised.
- Reopen or resolve supported issues.

### Corrective Actions

Managers, reviewers, and HQ administrators can:

- Create a corrective action from an issue or routine.
- Add an owner.
- Set a due date.
- Require evidence.
- Mark the action open or completed.
- Review open actions in the command center.

### Accountability

- Creation and status changes are audited.
- Organization and store filters are applied to every action.
- Missing or cross-store actions return a safe not-found response.

---

## 10. Team Chat

Team Chat is the human collaboration channel for a store or workspace.

Features include:

- Store-scoped conversation.
- Sender name and message time.
- Clear indication of the current user’s messages.
- Message composer and send action.
- Demo conversations with realistic operational context.
- Read-only behavior for viewer profiles.

Team Chat is intentionally separate from ausease AI Chat.

---

## 11. ausease AI Chat

### Operations Assistant

The AI assistant can help with:

- Assigning operational work.
- Checking outstanding tasks.
- Summarizing issues.
- Finding operating procedures.
- Answering store-operations questions.

### Safe Action Handling

- The assistant requires an active authenticated membership.
- Store and organization context are supplied by the server.
- Ambiguous delegation must request a clear owner.
- Viewer demo profiles cannot trigger assistant mutations.
- Supported actions use structured operational data rather than silently changing unrelated records.

### Voice Input

- Start and stop voice recording.
- Capture a high-quality audio note.
- Upload audio for transcription.
- Show permission and unsupported-device states.
- Convert the transcribed request into the normal assistant workflow.

---

## 12. Checklist Studio and Publishing

### Template Creation

Headquarters administrators can define:

- Standard name.
- Summary.
- Owner.
- Evidence requirement.
- Ordered steps.
- Guidance for each step.
- Required or optional steps.

### Version Creation

- The first template starts with version 1 in Draft.
- A new version can be created from an existing template.
- Version numbers increase automatically.
- Previous published versions are not edited.

### Publishing

Before publishing, HQ chooses:

- One or more stores.
- One or more roles.
- An effective date and time.

Publishing behavior:

- The draft becomes Published.
- Store and role assignments are saved.
- A publication audit event is created.
- Published versions are immutable.
- Completed historical work remains attached to its original version.
- Frontline users receive the latest effective version matching their store and role.

---

## 13. Headquarters Administration

### Store Management

- Create stores.
- Update store details.
- Configure location and radius.
- Enable or pause location enforcement.

### Membership Management

- Invite a person by email.
- Assign organization, store, and role.
- Activate, invite, or disable membership.
- Avoid replacing an existing active membership with an email-only match.
- Prevent ambiguous invitations from activating the wrong tenant.

### Enterprise Domains and Identity Providers

- Add company domains.
- Configure SAML, OIDC, or OAuth provider metadata.
- Enable or disable a domain.
- Store credential configuration separately from safe API responses.
- Rotate credentials.
- Track credential version and validation status.

### Provisioning View

- View stores.
- View domains.
- View memberships.
- Review identity-provider configuration status.

---

## 14. Audit and Governance

Audited actions include:

- Routine completion.
- Presence check-in and denied check-in.
- Corrective-action creation and completion.
- Checklist access denial.
- Checklist open and submission.
- Checklist template creation.
- Checklist version creation.
- Checklist publication.
- Store and geofence changes.
- Membership and enterprise administration changes.
- Operations record changes.

Audit data records:

- Actor.
- Actor role.
- Organization.
- Store.
- Action.
- Resource type.
- Resource identifier.
- Timestamp.
- Relevant metadata.

Audit history is available to managers, reviewers, and headquarters administrators.

---

## 15. Data Synchronization and Concurrency

### Operations Snapshot

- Tasks, issues, and messages can be loaded as one authenticated store snapshot.
- Records remain separated by organization and store.

### Record Updates

- Updates include a record version.
- Compare-and-swap behavior rejects stale edits.
- Idempotency prevents repeated mutations from creating duplicate versions.
- Accepted changes are audited.
- If audit writing fails, the operation change is rolled back.

### Published Checklist Progress

- Completed steps persist in PostgreSQL and reload across devices.
- Progress is scoped by organization, store, user, exact checklist version, checklist item, and Sydney work date.
- A later published version starts with independent progress.
- Completed prior-version history is retained unchanged.
- Store assignment, role assignment, effective date, and presence access are revalidated by the server for every update.

### Mobile State

- Demo changes remain local and never mutate live API data.
- Live operational changes use authenticated API requests.
- Signed-out state returns to safe starter data.
- Authenticated state can hydrate the assigned workspace.

---

## 16. Demo Workspace

### Access Model

The demo requires:

- A signed-in Clerk account.
- An active ausease membership.
- Development mode.
- Server-side verification of the private demo access code.

The code is never bundled into the app or returned by the API.

### Demo Profiles

- Store team member.
- Store manager.
- Regional reviewer.
- Headquarters administrator.
- Read-only viewer.

### Demo Data

- Realistic tasks.
- Issues in multiple states.
- Team Chat messages.
- Daily routines.
- Written checklists.
- Checklist versions and assignments.
- Command-center metrics.
- Audit events.
- Stores, memberships, and domain configuration.

### Demo Safety

- No fake Clerk accounts are created.
- No live organization or store records are created.
- Profile switching is local.
- Task, issue, checklist, and chat changes remain local.
- Viewer mode remains read-only.
- Leaving the demo resets local checklist, profile, and custom-template state.

---

## 17. End-to-End User Workflows

### Workflow A — Sign In and Enter the Workspace

1. The user opens ausease.
2. The user signs in with email/password or SSO.
3. Clerk verifies the identity and any additional security step.
4. ausease finds the matching active membership.
5. Organization, store, role, and access status are loaded.
6. The user enters the assigned store workspace.
7. If membership is invited, disabled, or unassigned, the app shows a specific access message.

### Workflow B — Start a Store Shift

1. The employee opens Tasks.
2. The app loads store-presence status.
3. The employee allows location access.
4. The app checks the employee’s distance from the store.
5. A time-limited presence record is created.
6. If required, the manager also checks in.
7. Checklist access becomes Ready.

### Workflow C — Complete a Routine With Evidence

1. The employee opens Today’s Routines.
2. The app verifies store presence and role access.
3. The employee selects Add Photo.
4. Camera permission is requested.
5. The employee captures evidence.
6. The app requests a secure upload URL.
7. The photo is uploaded and registered.
8. The routine is completed with the evidence identifier.
9. The app refreshes the routine and command-center data.
10. The completion is added to audit history.

### Workflow D — Recover From an Offline Evidence Upload

1. The employee captures a required evidence photo.
2. The network request fails.
3. ausease saves the photo and routine details in the device queue.
4. The employee sees “Saved for sync.”
5. The app returns to the foreground or connectivity is restored.
6. ausease retries the queued upload.
7. Successful evidence is registered and the routine is completed.
8. The queue entry is removed.
9. Temporary failures remain queued without duplicating the upload.

### Workflow E — Report and Resolve an Issue

1. A team member opens Issues.
2. The team member creates an issue with title, area, and urgency.
3. The issue appears as Open.
4. A manager or reviewer assesses it.
5. A corrective action is created with owner, due date, and evidence rule.
6. Work is completed.
7. The corrective action is marked Completed.
8. The issue can be resolved.
9. Changes are visible in command-center metrics and audit history.

### Workflow F — Publish a New Operating Standard

1. An HQ administrator opens Checklist Studio.
2. The administrator creates a checklist or chooses New Version.
3. The administrator enters the summary, owner, evidence rule, steps, and guidance.
4. The draft is saved.
5. The administrator selects stores and roles.
6. The administrator sets an effective date.
7. The version is published.
8. The published version becomes immutable.
9. The API waits until the effective date before returning it to assigned users.
10. Each store team sees only the latest version matching its store and role.

### Workflow G — Notify a Store Team About a New Standard

1. A published checklist reaches its effective date.
2. An assigned employee or manager opens Tasks.
3. The API returns the latest effective checklist for that store and role.
4. ausease displays a New Operating Standard notice.
5. The notice shows name, version, effective date, and owner.
6. The user reviews the checklist.
7. The user dismisses the notice.
8. The dismissal is remembered on that device.
9. A later version produces a new notice.

### Workflow H — Ask the AI Assistant for Help

1. The user opens AI Chat.
2. The user types or records a request.
3. Voice input is transcribed when used.
4. The server supplies the authenticated organization, store, and role context.
5. The assistant answers or proposes a supported operation.
6. If ownership is ambiguous, the assistant asks for a specific person.
7. Allowed actions update operational state.
8. Viewer profiles receive read-only guidance instead of a mutation.

### Workflow I — Review Store Performance

1. A manager, reviewer, or HQ administrator opens Home.
2. The command center loads tasks, issues, overdue routines, actions, and bottlenecks.
3. The user opens items needing attention.
4. Evidence and corrective actions are reviewed.
5. The user checks audit history for accountability.

### Workflow J — Invite and Provision a Team Member

1. An HQ administrator opens the Control Room.
2. The administrator enters the person’s email.
3. A store and role are selected.
4. An invitation is created.
5. The person signs in through Clerk.
6. ausease safely matches the pending invitation.
7. The membership becomes active only when the tenant match is unambiguous.
8. The person receives access to the assigned organization and store.

### Workflow K — Run a Demo Walkthrough

1. An active ausease team member signs in.
2. The member opens the private demo workspace.
3. The private demo code is verified by the server.
4. The member switches between employee, manager, reviewer, HQ admin, and viewer profiles.
5. Each profile shows role-appropriate data and permissions.
6. Demo interactions remain local.
7. The member exits the demo.
8. The real signed-in workspace is restored.

---

## 18. Technical Service Workflows

### Mobile App / Expo Service

**Purpose:** Runs the ausease mobile-first user interface.

Responsibilities:

- Expo Router navigation.
- Clerk session integration.
- React Query API state.
- Camera, audio, file, location, and device-storage workflows.
- Demo state.
- Mobile and web preview.

### API Server

**Purpose:** Enforces authentication, authorization, operations, and persistence.

Responsibilities:

- Membership and role validation.
- Store and organization isolation.
- Presence and geofence checks.
- Routines and evidence.
- Checklists and publishing.
- Corrective actions.
- Operations snapshots and concurrency.
- Audit events.
- AI assistant and transcription endpoints.
- HQ administration.

### Component Preview Service

**Purpose:** Supports isolated UI and design previews.

Responsibilities:

- Component-level visual prototyping.
- Design review without replacing the main application runtime.

### Shared Libraries

- **API specification:** Defines the typed OpenAPI contract.
- **React API client:** Generated request functions, hooks, and response types.
- **Database package:** PostgreSQL schema and shared database access.

---

## 19. Current Product Boundaries

- Team Chat and AI Chat are separate experiences.
- Demo personas are not real users.
- Demo mode does not create live data.
- Viewer is demo-only.
- Published checklist versions cannot be edited.
- Future checklist versions do not appear before their effective date.
- Device notification banners are in-app notices; operating-system push notifications are not currently part of this workflow.

---

## 20. Feature Checklist

### Identity and Access

- [x] Clerk authentication
- [x] Email verification and additional sign-in verification
- [x] SSO entry point
- [x] Active membership enforcement
- [x] Organization and store isolation
- [x] Role-based authorization
- [x] Invitation and membership administration
- [x] Demo access code verification

### Frontline Operations

- [x] Home store pulse
- [x] Shift progress
- [x] Tasks
- [x] Daily routines
- [x] Written checklists
- [x] Cross-device published checklist progress
- [x] Evidence photos
- [x] Offline evidence retry
- [x] Store presence and geofence
- [x] Issue reporting
- [x] Team Chat
- [x] ausease AI Chat
- [x] Voice assistant input
- [x] New-standard in-app notice

### Management and Review

- [x] Operations Command Center
- [x] Overdue routine visibility
- [x] Corrective actions
- [x] Approval bottleneck metrics
- [x] Audit history
- [x] Evidence review data

### Headquarters

- [x] Store administration
- [x] Geofence administration
- [x] Membership administration
- [x] Domain and identity-provider administration
- [x] Checklist template creation
- [x] Immutable checklist versioning
- [x] Store and role targeting
- [x] Effective-date publishing

### Reliability and Governance

- [x] Authenticated API
- [x] Tenant and store boundaries
- [x] Object-storage evidence
- [x] Optimistic operations state
- [x] Version conflict detection
- [x] Idempotent mutation handling
- [x] Audit rollback protection
- [x] Automated API and mobile regression tests
