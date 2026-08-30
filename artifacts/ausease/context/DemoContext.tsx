import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  AuditEvent,
  CommandCenterResponse,
  EnterpriseProfile,
  EnterpriseProvisioning,
  RoutineInstance,
  TodayRoutinesResponse,
} from '@workspace/api-client-react';
import type { ChatMessage, Issue, Task } from './OperationsContext';

export type DemoProfileKey = 'employee' | 'manager' | 'reviewer' | 'hq_admin' | 'viewer';

export type DemoProfile = EnterpriseProfile & {
  demoKey: DemoProfileKey;
  displayName: string;
  initials: string;
  roleLabel: string;
};

export type DemoProfileDetails = Pick<DemoProfile, 'displayName' | 'initials' | 'roleLabel'>;

export type DemoChecklistItem = {
  id: string;
  title: string;
  guidance: string;
  required: boolean;
  done: boolean;
};

export type DemoChecklist = {
  id: string;
  templateId?: string;
  versionId?: string;
  version: number;
  status: 'draft' | 'published';
  effectiveDate: string;
  assignedStores: string[];
  assignedRoles: string[];
  routineId: string;
  name: string;
  summary: string;
  owner: string;
  evidenceLabel: string;
  items: DemoChecklistItem[];
};

export type DemoData = {
  profile: DemoProfile;
  routines: TodayRoutinesResponse;
  checklists: DemoChecklist[];
  checklistTemplates: DemoChecklist[];
  commandCenter: CommandCenterResponse;
  audit: { events: AuditEvent[] };
  provisioning: EnterpriseProvisioning;
  tasks: Task[];
  issues: Issue[];
  messages: ChatMessage[];
  presence: {
    allowed: true;
    reason: 'ready';
    store: {
      id: string;
      name: string;
      radiusMeters: number;
      geofenceEnabled: true;
    };
    userPresent: true;
    managerPresent: true;
  };
};

const organization = { id: 'demo-organization', name: 'ausease demo workspace' };
const pittStreet = {
  id: 'demo-pitt-street',
  name: 'Sydney · Pitt Street',
  latitude: -33.8688,
  longitude: 151.2093,
  geofenceRadiusMeters: 150,
  geofenceEnabled: true,
};
const bondi = {
  id: 'demo-bondi-junction',
  name: 'Sydney · Bondi Junction',
  latitude: -33.8915,
  longitude: 151.2519,
  geofenceRadiusMeters: 180,
  geofenceEnabled: true,
};
const allStores = {
  id: 'demo-all-stores',
  name: 'All stores · Sydney region',
  latitude: null,
  longitude: null,
  geofenceRadiusMeters: 150,
  geofenceEnabled: true,
};

const profiles: Record<DemoProfileKey, DemoProfile> = {
  employee: {
    demoKey: 'employee',
    displayName: 'Alex Carter',
    initials: 'AC',
    roleLabel: 'Store team member',
    access: 'active',
    userId: 'demo-employee',
    organization,
    store: pittStreet,
    role: 'employee',
  },
  manager: {
    demoKey: 'manager',
    displayName: 'Mia Chen',
    initials: 'MC',
    roleLabel: 'Store manager',
    access: 'active',
    userId: 'demo-manager',
    organization,
    store: pittStreet,
    role: 'manager',
  },
  reviewer: {
    demoKey: 'reviewer',
    displayName: 'Jordan Lee',
    initials: 'JL',
    roleLabel: 'Regional reviewer',
    access: 'active',
    userId: 'demo-reviewer',
    organization,
    store: bondi,
    role: 'reviewer',
  },
  hq_admin: {
    demoKey: 'hq_admin',
    displayName: 'Taylor Morgan',
    initials: 'TM',
    roleLabel: 'Headquarters admin',
    access: 'active',
    userId: 'demo-hq-admin',
    organization,
    store: allStores,
    role: 'hq_admin',
  },
  viewer: {
    demoKey: 'viewer',
    displayName: 'Sam Wilson',
    initials: 'SW',
    roleLabel: 'Read-only viewer',
    access: 'active',
    userId: 'demo-viewer',
    organization,
    store: pittStreet,
    // Viewer is intentionally not added to the production role enum.
    role: 'employee',
  },
};

const baseTasks: Task[] = [
  { id: 'demo-task-1', title: 'Complete opening safety walk', area: 'Store floor', due: 'Due 9:30 am', done: false, priority: 'high' },
  { id: 'demo-task-2', title: 'Check promotional displays', area: 'Front of store', due: 'Due today', done: false },
  { id: 'demo-task-3', title: 'Count high-value stock', area: 'Stockroom', due: 'Due today', done: true },
  { id: 'demo-task-4', title: 'Upload closing photos', area: 'Store floor', due: 'Due 6:00 pm', done: false },
  { id: 'demo-task-5', title: 'Replenish best-selling sizes', area: 'Stockroom', due: 'Due 11:00 am', done: false },
  { id: 'demo-task-6', title: 'Review delivery variance', area: 'Goods in', due: 'Due 1:00 pm', done: false, priority: 'high' },
  { id: 'demo-task-7', title: 'Complete team handover notes', area: 'Staff room', due: 'Due 3:30 pm', done: true },
  { id: 'demo-task-8', title: 'Confirm tomorrow’s roster', area: 'Team admin', due: 'Due 4:00 pm', done: false },
];

const baseIssues: Issue[] = [
  { id: 'demo-issue-1', title: 'Freezer temperature is rising', area: 'Back of house', status: 'In progress', time: '12 min ago', urgent: true },
  { id: 'demo-issue-2', title: 'Light out above fitting rooms', area: 'Customer area', status: 'Open', time: '48 min ago' },
  { id: 'demo-issue-3', title: 'Delivery arrived at dock', area: 'Goods in', status: 'Resolved', time: 'Yesterday' },
  { id: 'demo-issue-4', title: 'Price ticket missing on new season rail', area: 'Front of store', status: 'Open', time: '1 hr ago' },
  { id: 'demo-issue-5', title: 'Roster change needs manager approval', area: 'Team admin', status: 'In progress', time: '2 hrs ago' },
];

const baseMessages: ChatMessage[] = [
  { id: 'demo-message-1', author: 'Mia Chen', text: 'Morning team — the new display guide is in the tasks tab.', time: '8:42 am' },
  { id: 'demo-message-2', author: 'You', text: 'Got it. I’ll take the front of store checks.', time: '8:45 am', mine: true },
  { id: 'demo-message-3', author: 'Jordan Lee', text: 'Freezer issue has been raised with maintenance.', time: '9:02 am' },
  { id: 'demo-message-4', author: 'Taylor Morgan', text: 'Reminder: upload one wide shot and one detail shot for each close.', time: '9:18 am' },
  { id: 'demo-message-5', author: 'Mia Chen', text: 'Bondi Junction is clear for the regional walk this afternoon.', time: '9:26 am' },
  { id: 'demo-message-6', author: 'You', text: 'I’ve picked up the replenishment and delivery checks.', time: '9:31 am', mine: true },
];

function makeRoutines(profile: DemoProfile): TodayRoutinesResponse {
  const role = profile.demoKey === 'employee' || profile.demoKey === 'viewer' ? 'employee' : profile.role;
  return {
    dateKey: '2026-08-25',
    routines: [
      {
        id: `routine-${profile.demoKey}-1`,
        routineId: `routine-${profile.demoKey}-1`,
        name: 'Opening safety walk',
        routineType: 'sod',
        dueTime: '9:30 am',
        assignedRole: role,
        evidenceRequired: true,
        status: 'not_started',
        evidenceCount: 0,
      },
      {
        id: `routine-${profile.demoKey}-2`,
        routineId: `routine-${profile.demoKey}-2`,
        name: 'Promotional display check',
        routineType: 'sod',
        dueTime: '12:00 pm',
        assignedRole: role,
        evidenceRequired: true,
        status: 'completed',
        completedAt: '2026-08-25T08:35:00.000Z',
        evidenceCount: 1,
      },
      {
        id: `routine-${profile.demoKey}-3`,
        routineId: `routine-${profile.demoKey}-3`,
        name: 'Closing handover',
        routineType: 'eod',
        dueTime: '6:00 pm',
        assignedRole: role,
        evidenceRequired: true,
        status: profile.demoKey === 'reviewer' ? 'overdue' : 'not_started',
        evidenceCount: 0,
      },
    ],
  };
}

function makeChecklists(profile: DemoProfile, progress: Record<string, boolean> = {}): DemoChecklist[] {
  const templates: Array<{
    id: string;
    routineNumber: number;
    name: string;
    summary: string;
    evidenceLabel: string;
    items: Array<[string, string, boolean]>;
  }> = [
    {
      id: 'opening',
      routineNumber: 1,
      name: 'Opening safety walk',
      summary: 'Make the floor safe, ready, and customer-ready before doors open.',
      evidenceLabel: 'One wide floor photo required',
      items: [
        ['Emergency exits are clear', 'Walk both marked exits and remove cartons, fixtures, or stock from the path.', true],
        ['Wet-floor signs and spill kit are ready', 'Check the cleaning station and confirm the kit is stocked.', true],
        ['First aid kit seal is intact', 'Confirm the kit is in its marked location and the seal has not been broken.', false],
        ['Temperature log is within range', 'Record the back-of-house reading and raise an issue if it is outside range.', true],
      ],
    },
    {
      id: 'visual',
      routineNumber: 2,
      name: 'Promotional display check',
      summary: 'Confirm the campaign is consistent across signage, stock, and presentation.',
      evidenceLabel: 'Detail photo required for campaign bay',
      items: [
        ['Campaign header is installed', 'Use the current display guide and check the header is straight and secure.', true],
        ['Price tickets match the campaign', 'Compare the ticket, shelf label, and product price before opening.', true],
        ['Hero sizes are replenished', 'Pull the next size run from the stockroom and face the rail forward.', true],
        ['Display is free of packaging', 'Remove hangers, cartons, and loose packaging from the customer view.', false],
      ],
    },
    {
      id: 'closing',
      routineNumber: 3,
      name: 'Closing handover',
      summary: 'Leave the next shift a clear, accountable handover with evidence.',
      evidenceLabel: 'Two closing photos required',
      items: [
        ['Open issues have an owner', 'Review unresolved issues and assign the next action before handover.', true],
        ['High-value stock is secured', 'Complete the count and confirm the stockroom is locked.', true],
        ['Till and back door checks are logged', 'Record both checks in the closing notes for the manager.', true],
        ['Handover message is posted', 'Share anything the opening team needs to know in Team chat.', false],
      ],
    },
  ];
  return templates.map((template) => ({
    id: `checklist-${profile.demoKey}-${template.id}`,
    templateId: `template-${template.id}`,
    version: 1,
    status: 'published' as const,
    effectiveDate: '2026-08-25',
    assignedStores: [pittStreet.id, bondi.id],
    assignedRoles: ['employee', 'manager', 'reviewer', 'hq_admin'],
    routineId: `routine-${profile.demoKey}-${template.routineNumber}`,
    name: template.name,
    summary: template.summary,
    owner: profile.displayName,
    evidenceLabel: template.evidenceLabel,
    items: template.items.map(([title, guidance, required], index) => {
      const itemId = `checklist-${profile.demoKey}-${template.id}-${index + 1}`;
      return { id: itemId, title, guidance, required, done: progress[itemId] ?? (template.id === 'visual' && index < 2) };
    }),
  }));
}

function makeCommandCenter(profile: DemoProfile, tasks: Task[], issues: Issue[], routines: RoutineInstance[]): CommandCenterResponse {
  return {
    generatedAt: '2026-08-25T09:15:00.000Z',
    store: { name: profile.store?.name ?? 'All stores' },
    metrics: {
      tasksTotal: tasks.length,
      tasksCompleted: tasks.filter((task) => task.done).length,
      openIssues: issues.filter((issue) => issue.status !== 'Resolved').length,
      openActions: profile.demoKey === 'hq_admin' ? 6 : profile.demoKey === 'reviewer' ? 3 : 1,
      overdueRoutines: routines.filter((routine) => routine.status === 'overdue').length,
      approvalBottlenecks: profile.demoKey === 'manager' ? 2 : profile.demoKey === 'reviewer' ? 1 : 0,
    },
    routines,
    actions: [],
    stores: profile.demoKey === 'hq_admin' ? [{ name: pittStreet.name }, { name: bondi.name }] : [{ name: profile.store?.name }],
  };
}

function makeAudit(profile: DemoProfile): { events: AuditEvent[] } {
  return {
    events: [
      {
        id: `demo-audit-${profile.demoKey}-1`,
        action: profile.demoKey === 'hq_admin' ? 'Reviewed store access' : 'Approved opening checklist',
        resourceType: profile.demoKey === 'hq_admin' ? 'membership' : 'checklist',
        resourceId: 'demo-resource-1',
        actorRole: profile.roleLabel,
        metadata: {},
        createdAt: '2026-08-25T09:05:00.000Z',
      },
      {
        id: `demo-audit-${profile.demoKey}-2`,
        action: 'Updated corrective action',
        resourceType: 'issue',
        resourceId: 'demo-issue-1',
        actorRole: 'Store manager',
        metadata: {},
        createdAt: '2026-08-25T08:52:00.000Z',
      },
      {
        id: `demo-audit-${profile.demoKey}-3`,
        action: 'Completed visual standards review',
        resourceType: 'checklist',
        resourceId: `checklist-${profile.demoKey}-visual`,
        actorRole: 'Store team member',
        metadata: {},
        createdAt: '2026-08-25T08:35:00.000Z',
      },
      {
        id: `demo-audit-${profile.demoKey}-4`,
        action: 'Raised temperature exception',
        resourceType: 'issue',
        resourceId: 'demo-issue-1',
        actorRole: 'Store team member',
        metadata: {},
        createdAt: '2026-08-25T08:18:00.000Z',
      },
    ],
  };
}

function makeProvisioning(): EnterpriseProvisioning {
  return {
    domains: [
      {
        id: 'demo-domain-1',
        organizationId: organization.id,
        domain: 'ausease.demo',
        providerType: 'oidc',
        providerName: 'Demo identity provider',
        issuerUrl: null,
        clientId: null,
        secretConfigured: true,
        credentialStatus: 'configured',
        credentialValidationError: null,
        credentialVersion: 2,
        credentialRotatedAt: '2026-08-20T08:00:00.000Z',
        enabled: true,
        updatedAt: '2026-08-20T08:00:00.000Z',
      },
    ],
    stores: [pittStreet, bondi],
    memberships: [
      { id: 'demo-member-1', organizationId: organization.id, storeId: pittStreet.id, clerkUserId: 'demo-employee', email: 'alex@ausease.demo', role: 'employee', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-20T08:00:00.000Z' },
      { id: 'demo-member-2', organizationId: organization.id, storeId: pittStreet.id, clerkUserId: 'demo-manager', email: 'mia@ausease.demo', role: 'manager', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-20T08:00:00.000Z' },
      { id: 'demo-member-3', organizationId: organization.id, storeId: bondi.id, clerkUserId: 'demo-reviewer', email: 'jordan@ausease.demo', role: 'reviewer', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-08-20T08:00:00.000Z' },
    ],
  };
}

export function getDemoData(profileKey: DemoProfileKey, profileDetails: Partial<DemoProfileDetails> = {}, checklistProgress: Record<string, boolean> = {}): DemoData {
  const baseProfile = profiles[profileKey];
  const profile: DemoProfile = {
    ...baseProfile,
    ...profileDetails,
    organization: baseProfile.organization ? { ...baseProfile.organization } : baseProfile.organization,
    store: baseProfile.store ? { ...baseProfile.store } : baseProfile.store,
  };
  const tasks = baseTasks.map((task) => ({ ...task, assignee: profile.displayName }));
  const issues = baseIssues.map((issue) => ({ ...issue }));
  const messages = baseMessages.map((message) => ({ ...message }));
  const routines = makeRoutines(profile);
  const checklists = makeChecklists(profile, checklistProgress);
  return {
    profile,
    routines,
    checklists,
    checklistTemplates: checklists,
    commandCenter: makeCommandCenter(profile, tasks, issues, routines.routines),
    audit: makeAudit(profile),
    provisioning: makeProvisioning(),
    tasks,
    issues,
    messages,
    presence: {
      allowed: true,
      reason: 'ready',
      store: {
        id: profile.store?.id ?? allStores.id,
        name: profile.store?.name ?? allStores.name,
        radiusMeters: profile.store?.geofenceRadiusMeters ?? 150,
        geofenceEnabled: true,
      },
      userPresent: true,
      managerPresent: true,
    },
  };
}

type DemoContextValue = {
  canEnterDemo: boolean;
  isDemoMode: boolean;
  demoEligible: boolean;
  profileKey: DemoProfileKey;
  profile: DemoProfile;
  profileOptions: DemoProfile[];
  data: DemoData;
  isReadOnly: boolean;
  verifyDemoAccess: (code: string) => Promise<void>;
  exitDemo: () => void;
  switchProfile: (profileKey: DemoProfileKey) => void;
  updateProfile: (details: Partial<DemoProfileDetails>) => void;
  toggleChecklistItem: (checklistId: string, itemId: string) => void;
  createChecklistDraft: (input: {
    templateId?: string;
    name: string;
    summary: string;
    owner: string;
    evidenceLabel: string;
    effectiveDate: string;
    assignedStores: string[];
    assignedRoles: string[];
    items: Array<{ title: string; guidance: string; required: boolean }>;
  }) => string;
  publishChecklist: (checklistId: string) => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children, getToken, isSignedIn }: {
  children: React.ReactNode;
  getToken: () => Promise<string | null>;
  isSignedIn: boolean;
}) {
  const canEnterDemo = typeof __DEV__ !== 'undefined' && __DEV__ && Boolean(isSignedIn);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoEligible, setDemoEligible] = useState(false);
  const [profileKey, setProfileKey] = useState<DemoProfileKey>('employee');
  const [profileDetails, setProfileDetails] = useState<Partial<Record<DemoProfileKey, DemoProfileDetails>>>({});
  const [checklistProgress, setChecklistProgress] = useState<Partial<Record<DemoProfileKey, Record<string, boolean>>>>({});
  const [customChecklists, setCustomChecklists] = useState<DemoChecklist[]>([]);
  const data = useMemo(() => {
    const base = getDemoData(profileKey, profileDetails[profileKey], checklistProgress[profileKey]);
    const templates = [...base.checklistTemplates, ...customChecklists];
    const visibleChecklists = [...new Map(templates
      .filter((checklist) => checklist.status === 'published' &&
        (profileKey === 'hq_admin' ||
          checklist.assignedStores.includes(base.profile.store?.id ?? '') &&
          checklist.assignedRoles.includes(base.profile.role)))
      .sort((left, right) => right.version - left.version)
      .map((checklist) => [checklist.templateId ?? checklist.id, checklist] as const)).values()];
    return { ...base, checklistTemplates: templates, checklists: visibleChecklists };
  }, [checklistProgress, customChecklists, profileDetails, profileKey]);
  useEffect(() => {
    let cancelled = false;
    if (!canEnterDemo) {
      setDemoEligible(false);
      return () => { cancelled = true; };
    }
    const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : '';
    void getToken().then((token) => fetch(`${baseUrl}/api/demo/eligibility`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })).then((response) => {
      if (!cancelled) setDemoEligible(response.ok);
    }).catch(() => {
      if (!cancelled) setDemoEligible(false);
    });
    return () => { cancelled = true; };
  }, [canEnterDemo, getToken]);
  const verifyDemoAccess = useCallback(async (code: string) => {
    if (!canEnterDemo || !demoEligible) throw new Error('Sign in with an active team account before opening the demo workspace.');
    const token = await getToken();
    const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : '';
    const response = await fetch(`${baseUrl}/api/demo/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Demo access could not be verified.');
    }
    setIsDemoMode(true);
  }, [canEnterDemo, demoEligible, getToken]);
  useEffect(() => {
    if (!isSignedIn) {
      setIsDemoMode(false);
      setDemoEligible(false);
      setProfileKey('employee');
      setProfileDetails({});
      setChecklistProgress({});
      setCustomChecklists([]);
    }
  }, [isSignedIn]);
  const exitDemo = useCallback(() => {
    setIsDemoMode(false);
    setProfileKey('employee');
    setProfileDetails({});
    setChecklistProgress({});
    setCustomChecklists([]);
  }, []);
  const updateProfile = useCallback((details: Partial<DemoProfileDetails>) => {
    setProfileDetails((current) => ({ ...current, [profileKey]: { ...current[profileKey], ...details } as DemoProfileDetails }));
  }, [profileKey]);
  const toggleChecklistItem = useCallback((checklistId: string, itemId: string) => {
    if (!isDemoMode || profileKey === 'viewer') return;
    setChecklistProgress((current) => {
      const currentProfile = current[profileKey] ?? {};
      const currentValue = currentProfile[`${checklistId}:${itemId}`] ?? currentProfile[itemId];
      return {
        ...current,
        [profileKey]: {
          ...currentProfile,
          [itemId]: !currentValue,
          [`${checklistId}:${itemId}`]: !currentValue,
        },
      };
    });
  }, [isDemoMode, profileKey]);
  const createChecklistDraft = useCallback((input: {
    templateId?: string;
    name: string;
    summary: string;
    owner: string;
    evidenceLabel: string;
    effectiveDate: string;
    assignedStores: string[];
    assignedRoles: string[];
    items: Array<{ title: string; guidance: string; required: boolean }>;
  }) => {
    const source = input.templateId ? customChecklists.find((checklist) => checklist.templateId === input.templateId) : undefined;
    const templateId = input.templateId ?? `template-demo-${Date.now()}`;
    const version = (source?.version ?? (input.templateId ? 1 : 0)) + 1;
    const checklistId = `checklist-demo-${templateId}-${version}`;
    setCustomChecklists((current) => [...current, {
      id: checklistId,
      templateId,
      version,
      status: 'draft',
      effectiveDate: input.effectiveDate,
      assignedStores: input.assignedStores,
      assignedRoles: input.assignedRoles,
      routineId: `routine-${checklistId}`,
      name: input.name,
      summary: input.summary,
      owner: input.owner,
      evidenceLabel: input.evidenceLabel,
      items: input.items.map((item, index) => ({
        id: `${checklistId}-item-${index + 1}`,
        ...item,
        done: false,
      })),
    }]);
    return checklistId;
  }, [customChecklists]);
  const publishChecklist = useCallback((checklistId: string) => {
    setCustomChecklists((current) => current.map((checklist) => checklist.id === checklistId ? { ...checklist, status: 'published' } : checklist));
  }, []);
  const profileOptions = useMemo(() => Object.values(profiles).map((option) => getDemoData(option.demoKey, profileDetails[option.demoKey]).profile), [profileDetails]);
  const value = useMemo<DemoContextValue>(() => ({
    canEnterDemo,
    isDemoMode,
    demoEligible,
    profileKey,
    profile: data.profile,
    profileOptions,
    data,
    isReadOnly: isDemoMode && data.profile.demoKey === 'viewer',
    verifyDemoAccess,
    exitDemo,
    switchProfile: (nextProfile) => { if (canEnterDemo) setProfileKey(nextProfile); },
    updateProfile,
    toggleChecklistItem,
    createChecklistDraft,
    publishChecklist,
  }), [canEnterDemo, createChecklistDraft, data, demoEligible, exitDemo, isDemoMode, profileKey, profileOptions, publishChecklist, toggleChecklistItem, updateProfile, verifyDemoAccess]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo must be used inside DemoProvider');
  return value;
}