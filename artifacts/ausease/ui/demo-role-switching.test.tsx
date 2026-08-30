import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

type Props = {
  children?: React.ReactNode;
  visible?: boolean;
  [key: string]: unknown;
};

const View = 'View';
const Text = 'Text';
const Pressable = 'Pressable';
const TextInput = 'TextInput';

function PassThrough({ children, ...props }: Props) {
  return React.createElement(View, props, children);
}

function MockFlatList({ data = [], renderItem, ...props }: Props & {
  data?: unknown[];
  renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
}) {
  return React.createElement(
    View,
    props,
    data.map((item, index) => React.createElement(React.Fragment, { key: String(index) }, renderItem?.({ item, index }))),
  );
}

function MockModal({ visible, children, ...props }: Props) {
  return visible ? React.createElement(View, props, children) : null;
}

const colors = {
  background: '#f8f7f3',
  foreground: '#17202a',
  primary: '#d65d45',
  primaryForeground: '#ffffff',
  mutedForeground: '#68737d',
  card: '#ffffff',
  border: '#d9dde0',
  accent: '#b8d8c2',
  accentForeground: '#173b2d',
  secondary: '#e8eef0',
  secondaryForeground: '#27404b',
  input: '#c8d0d4',
  destructive: '#bd493b',
  coralSoft: '#fce4e0',
  ochre: '#b4812b',
};

let routerReplace: (() => void) | undefined;
let routerPush: (() => void) | undefined;
let authSignedIn = true;
let signInPasswordCalls = 0;
let demoAccessCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
let liveMutationCalls = 0;
let profileQueryEnabledCalls: boolean[] = [];
const testStorage = new Map<string, string>();

const signInState: {
  status: string;
  password: (params: { emailAddress: string; password: string }) => Promise<{ error?: unknown }>;
  finalize: (params: { navigate: (params: { session: unknown; decorateUrl?: unknown }) => Promise<void> | void }) => Promise<void>;
  supportedSecondFactors?: Array<{ strategy: string }>;
  mfa: {
    sendEmailCode: () => Promise<void>;
    verifyEmailCode: (params: { code: string }) => Promise<void>;
  };
  reset: () => void;
} = {
  status: 'needs_first_factor',
  password: async () => {
    signInPasswordCalls += 1;
    signInState.status = 'complete';
    return {};
  },
  finalize: async ({ navigate }) => {
    await navigate({ session: {}, decorateUrl: undefined });
  },
  supportedSecondFactors: [],
  mfa: {
    sendEmailCode: async () => undefined,
    verifyEmailCode: async () => { signInState.status = 'complete'; },
  },
  reset: () => { signInState.status = 'needs_first_factor'; },
};

mock.module('react-native', {
  namedExports: {
    ActivityIndicator: View,
    Alert: { alert: () => undefined },
    AppState: { addEventListener: () => ({ remove: () => undefined }) },
    FlatList: MockFlatList,
    Linking: { openSettings: async () => undefined },
    Modal: MockModal,
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    Pressable,
    ScrollView: PassThrough,
    StyleSheet: { absoluteFill: {}, create: (styles: unknown) => styles },
    Text,
    TextInput,
    View,
  },
});

mock.module('@expo/vector-icons', {
  namedExports: {
    Feather: ({ name }: { name: string }) => React.createElement(Text, null, name),
  },
});

mock.module('expo-router', {
  namedExports: {
    Redirect: ({ href }: { href: string }) => React.createElement(View, { testID: 'router-redirect', href }),
    router: {
      push: () => routerPush?.(),
      replace: () => routerReplace?.(),
    },
    useRouter: () => ({
      push: () => routerPush?.(),
      replace: () => routerReplace?.(),
    }),
  },
});

mock.module('@clerk/expo', {
  namedExports: {
    useAuth: () => ({ isSignedIn: authSignedIn, userId: authSignedIn ? 'demo-user' : null, getToken: async () => authSignedIn ? 'demo-session-token' : null }),
    useSignIn: () => ({ signIn: signInState, errors: undefined, fetchStatus: 'idle' }),
    useSSO: () => ({ startSSOFlow: async () => ({}) }),
  },
});

mock.module('expo-av', {
  namedExports: {
    Audio: {},
  },
});

mock.module('expo-auth-session', {
  namedExports: {
    makeRedirectUri: () => 'https://example.test/sign-in/sso-callback',
  },
});

mock.module('expo-local-authentication', {
  namedExports: {
    AuthenticationType: { FACIAL_RECOGNITION: 1 },
    authenticateAsync: async () => ({ success: false }),
    hasHardwareAsync: async () => false,
    isEnrolledAsync: async () => false,
    supportedAuthenticationTypesAsync: async () => [],
  },
});

mock.module('expo-web-browser', {
  namedExports: {
    maybeCompleteAuthSession: () => undefined,
  },
});

mock.module('expo-file-system', {
  namedExports: {
    documentDirectory: null,
  },
});

mock.module('expo-file-system/legacy', {
  namedExports: {
    documentDirectory: null,
  },
});

mock.module('expo-image-picker', {
  namedExports: {
    MediaTypeOptions: { Images: 'Images' },
    launchCameraAsync: async () => ({ canceled: true, assets: [] }),
    requestCameraPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
  },
});

mock.module('expo-location', {
  namedExports: {
    Accuracy: { High: 'high' },
    getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0, accuracy: 1 } }),
    useForegroundPermissions: () => [{ granted: true, canAskAgain: true }, async () => ({ granted: true, canAskAgain: true })],
  },
});

mock.module('react-native-keyboard-controller', {
  namedExports: {
    KeyboardAvoidingView: PassThrough,
  },
});

mock.module('react-native-safe-area-context', {
  namedExports: {
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  },
});

mock.module('@/components/BrandDecor', {
  namedExports: {
    BrandBackdrop: PassThrough,
    BrandRule: PassThrough,
    NonInteractiveView: PassThrough,
  },
});

mock.module('@/components/AuseaseLogo', {
  namedExports: {
    AuseaseLogo: ({ variant }: { variant?: string }) => React.createElement(Text, null, variant === 'mark' ? 'ausease mark' : 'ausease'),
  },
});

mock.module('@/components/KeyboardAwareScrollViewCompat', {
  namedExports: {
    KeyboardAwareScrollViewCompat: PassThrough,
  },
});

mock.module('@/components/Screen', {
  namedExports: {
    Header: ({ title, eyebrow }: { title: string; eyebrow?: string }) => React.createElement(Text, null, eyebrow ? `${eyebrow} ${title}` : title),
    Pill: ({ label }: { label: string }) => React.createElement(Text, null, label),
    Screen: PassThrough,
    styles: { sectionTitle: {} },
  },
});

mock.module('@/hooks/useColors', {
  namedExports: {
    useColors: () => colors,
  },
});

mock.module('@workspace/api-client-react', {
  namedExports: {
    checkInToStore: async () => { liveMutationCalls += 1; },
    getGetOperationsCommandCenterQueryKey: () => ['command-center'],
    getGetPresenceStatusQueryKey: () => ['presence'],
    getGetTodayRoutinesQueryKey: () => ['today-routines'],
    getPresenceStatus: async () => ({
      allowed: true,
      reason: 'ready',
      store: { id: 'demo-pitt-street', name: 'Sydney · Pitt Street', radiusMeters: 150, geofenceEnabled: true },
      userPresent: true,
      managerPresent: true,
    }),
    getOperationsSnapshot: async () => ({ tasks: [], issues: [], messages: [] }),
    updateOperationsRecord: async () => { liveMutationCalls += 1; return { version: 1 }; },
    useAddEnterpriseDomain: () => ({ isPending: false, mutateAsync: async () => { liveMutationCalls += 1; } }),
    useAddEnterpriseStore: () => ({ isPending: false, mutateAsync: async () => { liveMutationCalls += 1; } }),
    useAskOperationsAssistant: () => ({ isPending: false, mutateAsync: async () => { liveMutationCalls += 1; return { message: 'Not available in this walkthrough.' }; } }),
    useCompleteRoutine: () => ({ isPending: false, mutateAsync: async () => { liveMutationCalls += 1; } }),
    useGetEnterpriseAudit: () => ({ data: { events: [] }, isError: false, isLoading: false }),
    useGetEnterpriseProfile: (options?: { query?: { enabled?: boolean } }) => {
      profileQueryEnabledCalls.push(options?.query?.enabled ?? true);
      return {
        data: {
          access: 'active',
          userId: 'signed-in-user',
          organization: { id: 'organization', name: 'ausease workspace' },
          store: { id: 'store', name: 'Sydney · Pitt Street' },
          role: 'employee',
        },
        isError: false,
        isLoading: false,
      };
    },
    useGetEnterpriseProvisioning: () => ({ data: { domains: [], stores: [], memberships: [] }, isError: false, isLoading: false }),
    useGetOperationsCommandCenter: () => ({ data: undefined, isError: false, isLoading: false }),
    useGetPublishedChecklists: () => ({ data: { checklists: [] }, isError: false, isLoading: false }),
    useGetTodayRoutines: () => ({ data: undefined, isError: false, isLoading: false, isSuccess: false, refetch: async () => ({ isSuccess: false }) }),
    useInviteEnterpriseMember: () => ({ isPending: false, mutate: () => { liveMutationCalls += 1; } }),
    useRegisterRoutineEvidence: () => ({ mutateAsync: async () => { liveMutationCalls += 1; return { id: 'evidence-1' }; } }),
    useRequestRoutineEvidenceUploadUrl: () => ({ mutateAsync: async () => { liveMutationCalls += 1; return { uploadURL: '', objectPath: '' }; } }),
    useUpdateChecklistProgress: () => ({ mutateAsync: async () => { liveMutationCalls += 1; } }),
    useUpdateEnterpriseMembership: () => ({ isPending: false, mutate: () => { liveMutationCalls += 1; } }),
  },
});

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (value && typeof value === 'object' && 'props' in value) {
    return textContent((value as { props: { children?: unknown } }).props.children);
  }
  if (React.isValidElement(value)) return textContent((value as React.ReactElement<{ children?: unknown }>).props.children);
  return '';
}

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findAll((node) => String(node.type) === Text).map((node) => textContent(node)).join(' ');
}

function elementByTestId(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  return renderer.root.findByProps({ testID });
}

async function press(renderer: TestRenderer.ReactTestRenderer, testID: string) {
  const element = elementByTestId(renderer, testID);
  await act(async () => {
    if (!element.props.disabled) await element.props.onPress();
  });
}

test('signed-out users can enter the demo and switch every role without live mutations', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const require = createRequire(__filename);
  const reactQuery = require('@tanstack/react-query') as {
    QueryClient: new () => unknown;
    QueryClientProvider: React.ComponentType<{ client: unknown; children: React.ReactNode }>;
  };
  const { DemoProvider } = await import('../context/DemoContext');
  const { default: MoreScreen } = await import('../app/(tabs)/more');
  const { default: SignInScreen } = await import('../app/(auth)/sign-in');
  const queryClient = new reactQuery.QueryClient();
  function DemoWalkthrough() {
    const [isSignedIn, setIsSignedIn] = useState(false);
    authSignedIn = isSignedIn;
    routerReplace = () => {
      authSignedIn = true;
      setIsSignedIn(true);
    };
    return isSignedIn
      ? React.createElement(reactQuery.QueryClientProvider, { client: queryClient, children: React.createElement(DemoProvider, { getToken: async () => 'demo-session-token', isSignedIn: true, children: React.createElement(MoreScreen) }) })
      : React.createElement(SignInScreen);
  }

  (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
  signInState.status = 'needs_first_factor';
  signInPasswordCalls = 0;
  demoAccessCalls = [];
  liveMutationCalls = 0;
  routerPush = undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    demoAccessCalls.push({ input, init });
    return { ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;

  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(DemoWalkthrough));
  });
  assert.match(renderedText(renderer), /Sign in to ausease/);

  await act(async () => {
    elementByTestId(renderer, 'login-email').props.onChangeText('demo@ausease.test');
    elementByTestId(renderer, 'login-password').props.onChangeText('demo-password');
  });
  await press(renderer, 'login-submit');
  assert.equal(signInPasswordCalls, 1);
  assert.equal(renderedText(renderer).includes('More'), true);
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.resolve();
  });

  await press(renderer, 'open-demo-access');
  await act(async () => {
    elementByTestId(renderer, 'demo-access-code').props.onChangeText('walkthrough-code');
  });
  await press(renderer, 'submit-demo-access');
  await act(async () => {
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  assert.equal(demoAccessCalls.length, 2);
  assert.equal((demoAccessCalls[0].input as string).endsWith('/api/demo/eligibility'), true);
  assert.equal((demoAccessCalls[1].input as string).endsWith('/api/demo/access'), true);
  assert.equal(renderedText(renderer).includes('Alex Carter'), true);
  assert.equal(textContent(elementByTestId(renderer, 'selected-profile-context')), 'Store team member · Sydney · Pitt Street');
  assert.equal(textContent(elementByTestId(renderer, 'selected-profile-initials')), 'AC');

  const profiles = [
    {
      key: 'reviewer',
      name: 'Jordan Lee',
      firstName: 'Jordan',
      initials: 'JL',
      role: 'Regional reviewer',
      store: 'Sydney · Bondi Junction',
      readOnly: false,
      governance: true,
      headquarters: false,
    },
    {
      key: 'viewer',
      name: 'Sam Wilson',
      firstName: 'Sam',
      initials: 'SW',
      role: 'Read-only viewer',
      store: 'Sydney · Pitt Street',
      readOnly: true,
      governance: false,
      headquarters: false,
    },
  ] as const;

  for (const profile of profiles) {
    await press(renderer, 'open-profile-picker');
    await press(renderer, `demo-profile-option-${profile.key}`);

    assert.equal(textContent(elementByTestId(renderer, 'selected-profile-name')), profile.name);
    assert.equal(textContent(elementByTestId(renderer, 'selected-profile-initials')), profile.initials);
    assert.equal(textContent(elementByTestId(renderer, 'selected-profile-context')), `${profile.role} · ${profile.store}`);
    assert.equal(renderer.root.findAllByProps({ testID: 'governance-section' }).length > 0, profile.governance);
    assert.equal(renderer.root.findAllByProps({ testID: 'headquarters-admin-section' }).length > 0, profile.headquarters);
    assert.equal(renderedText(renderer).includes('Read-only viewer · changes are unavailable'), profile.readOnly);

    if (profile.headquarters) {
      for (const mutationTestID of ['add-domain', 'add-store', 'invite-member']) {
        assert.equal(elementByTestId(renderer, mutationTestID).props.disabled, true);
        await press(renderer, mutationTestID);
      }
    }
  }

  assert.equal(liveMutationCalls, 0);
  await act(async () => {
    renderer.unmount();
  });
});

test('an active Clerk session immediately leaves the sign-in screen', async () => {
  const { default: SignInScreen } = await import('../app/(auth)/sign-in');
  authSignedIn = true;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(SignInScreen));
  });
  assert.equal(elementByTestId(renderer, 'router-redirect').props.href, '/(tabs)');
  await act(async () => renderer.unmount());
});

test('demo profile changes carry store context across every workspace tab and exit restores the signed-in workspace', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
  process.env.EXPO_PUBLIC_DOMAIN = '';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => testStorage.get(key) ?? null,
        setItem: (key: string, value: string) => { testStorage.set(key, value); },
        removeItem: (key: string) => { testStorage.delete(key); },
      },
    },
  });
  demoAccessCalls = [];
  liveMutationCalls = 0;
  profileQueryEnabledCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    demoAccessCalls.push({ input, init });
    return { ok: true, json: async () => ({}) } as Response;
  }) as typeof fetch;

  const require = createRequire(__filename);
  const reactQuery = require('@tanstack/react-query') as {
    QueryClient: new () => unknown;
    QueryClientProvider: React.ComponentType<{ client: unknown; children: React.ReactNode }>;
  };
  const { DemoProvider } = await import('../context/DemoContext');
  const { OperationsProvider } = await import('../context/OperationsContext');
  const { PresenceProvider } = await import('../context/PresenceContext');
  const { default: HomeScreen } = await import('../app/(tabs)/index');
  const { default: TasksScreen } = await import('../app/(tabs)/tasks');
  const { default: IssuesScreen } = await import('../app/(tabs)/issues');
  const { default: ChatScreen } = await import('../app/(tabs)/chat');
  const { default: AssistantScreen } = await import('../app/(tabs)/assistant');
  const { default: MoreScreen } = await import('../app/(tabs)/more');

  const tabs = [
    { key: 'home', Component: HomeScreen, demoData: 'Freezer temperature is rising' },
    { key: 'tasks', Component: TasksScreen, demoData: 'Complete opening safety walk' },
    { key: 'issues', Component: IssuesScreen, demoData: 'Light out above fitting rooms' },
    { key: 'chat', Component: ChatScreen, demoData: 'new display guide' },
    { key: 'assistant', Component: AssistantScreen, demoData: null },
    { key: 'more', Component: MoreScreen, demoData: 'Preview profile' },
  ] as const;
  type TabKey = typeof tabs[number]['key'];

  function DemoWorkspace() {
    const [activeTab, setActiveTab] = useState<TabKey>('more');
    const active = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
    return React.createElement(
      React.Fragment,
      null,
      tabs.map((tab) => React.createElement(Pressable, {
        key: tab.key,
        testID: `workspace-tab-${tab.key}`,
        onPress: () => setActiveTab(tab.key),
      }, tab.key)),
      React.createElement(active.Component),
    );
  }

  const queryClient = new reactQuery.QueryClient();
  const tree = React.createElement(
    reactQuery.QueryClientProvider,
    {
      client: queryClient,
      children: React.createElement(
        DemoProvider,
        {
          getToken: async () => 'demo-session-token',
          isSignedIn: true,
          children: React.createElement(
            OperationsProvider,
            {
              children: React.createElement(
                PresenceProvider,
                { children: React.createElement(DemoWorkspace) },
              ),
            },
          ),
        },
      ),
    },
  );

  const settle = async () => {
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      await Promise.resolve();
    });
  };
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assertText = (renderer: TestRenderer.ReactTestRenderer, expected: string) => {
    assert.match(renderedText(renderer), new RegExp(escapeRegExp(expected)));
  };

  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(tree);
  });
  await settle();

  await press(renderer, 'open-demo-access');
  await act(async () => {
    elementByTestId(renderer, 'demo-access-code').props.onChangeText('walkthrough-code');
  });
  await press(renderer, 'submit-demo-access');
  await settle();

  assert.equal(demoAccessCalls.length, 2);
  assert.equal(textContent(elementByTestId(renderer, 'selected-profile-name')), 'Alex Carter');

  await press(renderer, 'edit-demo-profile');
  await act(async () => {
    elementByTestId(renderer, 'demo-profile-name').props.onChangeText('Casey Nguyen');
    elementByTestId(renderer, 'demo-profile-initials').props.onChangeText('CN');
    elementByTestId(renderer, 'demo-profile-role').props.onChangeText('Opening lead');
  });
  await press(renderer, 'save-demo-profile');
  assert.equal(textContent(elementByTestId(renderer, 'selected-profile-name')), 'Casey Nguyen');
  assert.equal(textContent(elementByTestId(renderer, 'selected-profile-initials')), 'CN');
  assert.equal(textContent(elementByTestId(renderer, 'selected-profile-context')), 'Opening lead · Sydney · Pitt Street');

  await press(renderer, 'workspace-tab-tasks');
  await settle();
  assert.equal(renderer.root.findAllByProps({ testID: 'effective-standard-notice-template-opening' }).length, 1);
  await press(renderer, 'dismiss-standard-template-opening');
  assert.equal(renderer.root.findAllByProps({ testID: 'effective-standard-notice-template-opening' }).length, 0);
  await press(renderer, 'expand-checklist-employee-opening');
  assert.equal(renderer.root.findAllByProps({ testID: 'checklist-details-checklist-employee-opening' }).length, 1);
  const openingItem = elementByTestId(renderer, 'checklist-item-checklist-employee-opening-1');
  assert.equal(openingItem.props.disabled, false);
  const initiallyDone = openingItem.props.accessibilityState.checked;
  await press(renderer, 'checklist-item-checklist-employee-opening-1');
  assert.equal(elementByTestId(renderer, 'checklist-item-checklist-employee-opening-1').props.accessibilityState.checked, !initiallyDone);
  await press(renderer, 'workspace-tab-more');

  const profiles = [
    {
      key: 'reviewer',
      name: 'Jordan Lee',
      firstName: 'Jordan',
      role: 'Regional reviewer',
      store: 'Sydney · Bondi Junction',
      readOnly: false,
    },
    {
      key: 'viewer',
      name: 'Sam Wilson',
      firstName: 'Sam',
      role: 'Read-only viewer',
      store: 'Sydney · Pitt Street',
      readOnly: true,
    },
  ] as const;

  for (const profile of profiles) {
    await press(renderer, 'open-profile-picker');
    await press(renderer, `demo-profile-option-${profile.key}`);
    await settle();

    assert.equal(textContent(elementByTestId(renderer, 'selected-profile-name')), profile.name);
    assert.equal(textContent(elementByTestId(renderer, 'selected-profile-context')), `${profile.role} · ${profile.store}`);

    for (const tab of tabs) {
      await press(renderer, `workspace-tab-${tab.key}`);
      await settle();
      assertText(renderer, profile.store);
      if (tab.key !== 'more') {
        assertText(renderer, tab.key === 'assistant' ? `Hi ${profile.firstName}` : tab.demoData);
      }

      if (profile.readOnly) {
        assertText(renderer, 'Read-only viewer');
        if (tab.key === 'home') {
          assert.equal(elementByTestId(renderer, 'home-report-issue').props.disabled, true);
          await press(renderer, 'home-report-issue');
        }
        if (tab.key === 'tasks') {
          assert.equal(elementByTestId(renderer, 'store-check-in').props.disabled, true);
          assert.equal(elementByTestId(renderer, 'routine-evidence-routine-viewer-1').props.disabled, true);
          assert.equal(elementByTestId(renderer, 'task-demo-task-1').props.disabled, true);
          await press(renderer, 'expand-checklist-viewer-opening');
          assert.equal(elementByTestId(renderer, 'checklist-item-checklist-viewer-opening-1').props.disabled, true);
          await press(renderer, 'store-check-in');
          await press(renderer, 'routine-evidence-routine-viewer-1');
          await press(renderer, 'task-demo-task-1');
        }
        if (tab.key === 'issues') {
          assert.equal(elementByTestId(renderer, 'report-issue').props.disabled, true);
          await press(renderer, 'report-issue');
        }
        if (tab.key === 'chat') {
          assert.equal(elementByTestId(renderer, 'chat-input').props.editable, false);
          assert.equal(elementByTestId(renderer, 'send-message').props.disabled, true);
          await press(renderer, 'send-message');
        }
        if (tab.key === 'assistant') {
          assert.equal(elementByTestId(renderer, 'ai-input').props.editable, false);
          assert.equal(elementByTestId(renderer, 'ai-send').props.disabled, true);
          assert.equal(elementByTestId(renderer, 'voice-command').props.disabled, true);
          await press(renderer, 'ai-send');
          await press(renderer, 'voice-command');
        }
      }
    }

    await press(renderer, 'workspace-tab-more');
  }

  await press(renderer, 'open-profile-picker');
  await press(renderer, 'exit-demo');
  await settle();

  assert.equal(textContent(elementByTestId(renderer, 'selected-profile-name')), 'Alex Carter');
  assert.equal(textContent(elementByTestId(renderer, 'selected-profile-context')), 'Store team member · Sydney · Pitt Street');
  assert.equal(renderer.root.findAllByProps({ testID: 'demo-profile-switcher' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ testID: 'demo-access-notice' }).length, 0);
  assert.equal(renderedText(renderer).includes('Read-only viewer'), false);
  assert.equal(profileQueryEnabledCalls.at(-1), true);
  assert.equal(demoAccessCalls.length, 2);
  assert.equal(liveMutationCalls, 0);

  await press(renderer, 'workspace-tab-home');
  await settle();
  assert.equal(renderer.root.findAllByProps({ testID: 'home-demo-context' }).length, 0);
  assert.equal(renderedText(renderer).includes('Good morning, Alex'), true);
  assert.equal(elementByTestId(renderer, 'home-report-issue').props.disabled, false);

  await press(renderer, 'workspace-tab-chat');
  await settle();
  assert.equal(elementByTestId(renderer, 'chat-input').props.editable, true);
  assert.equal(elementByTestId(renderer, 'send-message').props.disabled, false);

  assert.equal(liveMutationCalls, 0);
  await act(async () => {
    renderer.unmount();
  });
});
