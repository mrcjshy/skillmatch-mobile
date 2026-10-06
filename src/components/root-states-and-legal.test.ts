// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
type El = { type: any; props: Props };

const nodes = (tree: any): El[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const ofType = (tree: any, type: string) => nodes(tree).filter((node) => node.type === type);
const flat = (style: any): Props => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flat)) : style || {});
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const host = (...names: string[]) => Object.fromEntries(names.map((name) => [name, name]));
const jsx = (type: any, props: Props) => (typeof type === 'function' ? type(props) : { type, props });
const read = (file: string): string => readFileSync(file, 'utf8');

function compile(file: string, modules: Props): Props {
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name: string) => { if (!(name in modules)) throw Error('Unexpected import: ' + name); return modules[name]; }, exports);
  return exports;
}

function stateful(modules: Props) {
  const slots: any[] = [];
  let cursor = 0;
  return {
    reset: () => { cursor = 0; },
    modules: {
      ...modules,
      react: {
        useState: (initial: any) => {
          const slot = cursor++;
          if (!(slot in slots)) slots[slot] = initial;
          return [slots[slot], (next: any) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }];
        },
      },
    },
  };
}

const ui = compile('src/constants/theme.ts', {
  'react-native': { Platform: { select: (v: Props) => v.android ?? v.default } },
  '@/global.css': {},
}).SkillMatchTheme.ui;

const common = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  '@/components/app-button': host('AppButton'),
  '@/components/form-message': host('FormMessage'),
  '@/components/state-screen': host('StateScreen'),
};

describe('Bootstrap error state', () => {
  function bootstrap(account: Props) {
    const retryAccountBootstrap = vi.fn();
    const signOutCurrentUser = vi.fn(async () => ({ error: null }));
    const store = stateful({ ...common, '@/lib/sign-out': { signOutCurrentUser }, '@/providers/account-provider': { useAccount: () => ({ status: 'error', accountError: { message: 'Could not reach the server.' }, isAccountLoading: false, retryAccountBootstrap, ...account }) } });
    const { default: Screen } = compile('src/app/bootstrap-error.tsx', store.modules);
    return { render: () => { store.reset(); return Screen() as El; }, retryAccountBootstrap, signOutCurrentUser };
  }

  it('leads with the problem, explains it, and offers Try again before a quiet Sign out', () => {
    const tree = bootstrap({}).render();
    expect(tree.type).toBe('StateScreen');
    expect(tree.props).toMatchObject({ tone: 'error', loading: false, title: "We couldn't set up your account", message: 'Could not reach the server.' });
    expect(ofType(tree, 'AppButton').map((node) => [node.props.label, node.props.variant ?? 'primary'])).toEqual([['Try again', 'primary'], ['Sign out', 'ghost']]);
  });

  it('keeps retry and sign-out mutually exclusive while either is busy', () => {
    const checking = bootstrap({ status: 'pending', accountError: null, isAccountLoading: true }).render();
    expect(checking.props).toMatchObject({ loading: true, tone: 'neutral', title: 'Checking your account', message: 'Checking your account…' });
    const [retry, signOut] = ofType(checking, 'AppButton');
    expect(retry.props.loading).toBe(true);
    expect(signOut.props.disabled).toBe(true);
  });

  it('retries bootstrap on demand and signs out through the shared sign-out path', async () => {
    const h = bootstrap({});
    const [retry, signOut] = ofType(h.render(), 'AppButton');
    retry.props.onPress();
    expect(h.retryAccountBootstrap).toHaveBeenCalledTimes(1);
    signOut.props.onPress(); await flush();
    expect(h.signOutCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('shows a sign-out failure as an error message and re-enables the action', async () => {
    const h = bootstrap({});
    h.signOutCurrentUser.mockResolvedValueOnce({ error: { message: '' } } as any);
    ofType(h.render(), 'AppButton')[1].props.onPress(); await flush();
    expect(ofType(h.render(), 'FormMessage').map((node) => node.props.message)).toEqual(['Sign out failed. Please try again.']);
    expect(ofType(h.render(), 'AppButton')[1].props.loading).toBe(false);
  });
});

describe('Blocked state', () => {
  it('states that the account is inactive with Sign out as the one action and no retry', async () => {
    const signOutCurrentUser = vi.fn(async () => ({ error: null }));
    const store = stateful({ ...common, '@/lib/sign-out': { signOutCurrentUser } });
    const { default: Blocked } = compile('src/app/blocked.tsx', store.modules);
    const tree = Blocked() as El;
    expect(tree.props).toMatchObject({ tone: 'warning', title: 'Account inactive' });
    expect(tree.props.message).toBe('Your SkillMatch account is currently inactive. Please contact the administrator for assistance.');
    const buttons = ofType(tree, 'AppButton');
    expect(buttons.map((node) => node.props.label)).toEqual(['Sign out']);
    buttons[0].props.onPress(); await flush();
    expect(signOutCurrentUser).toHaveBeenCalledTimes(1);
  });
});

describe('Not found and loading states', () => {
  it('sends a signed-in person to the dispatcher and offers a signed-out person one way home', () => {
    const redirect = (session: unknown) => (compile('src/app/+not-found.tsx', {
      ...common,
      'expo-router': { Link: 'Link', Redirect: 'Redirect' },
      '@/providers/session-provider': { useSession: () => ({ session }) },
    }).default() as El);
    expect(redirect({ user: {} })).toMatchObject({ type: 'Redirect', props: { href: '/' } });
    const tree = redirect(null);
    expect(tree.type).toBe('StateScreen');
    expect(tree.props.title).toBe('Page not found');
    const link = ofType(tree, 'Link')[0];
    expect(link.props).toMatchObject({ href: '/', asChild: true });
    expect(ofType(link, 'AppButton')[0].props.label).toBe('Go to home');
  });

  it('renders the inert loading route as a spinner state without developer wording', () => {
    const tree = compile('src/app/loading.tsx', common).default() as El;
    expect(tree.props).toMatchObject({ loading: true, title: 'Loading SkillMatch' });
    expect(JSON.stringify(tree.props)).not.toMatch(/reserved|later piece|unresolved/i);
  });

  it('renders the root inline gates through the same state screen', () => {
    const source = read('src/app/_layout.tsx');
    expect(source).toContain('<StateScreen loading title="Loading SkillMatch" message="Restoring your session…" />');
    expect(source).toContain('<StateScreen loading title="Loading SkillMatch" message="Checking your account…" />');
    expect(source).toContain('title="Session error"');
    expect(source).not.toContain('InlineGate');
    expect(source).not.toContain('#F5F3EF');
  });
});

describe('Legal document reading screen', () => {
  function legal(canGoBack: boolean) {
    const back = vi.fn();
    const replace = vi.fn();
    const sections = compile('src/lib/legal-document-sections.ts', {});
    const { LegalDocumentScreen } = compile('src/components/legal-document-screen.tsx', {
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      'expo-router': { useRouter: () => ({ canGoBack: () => canGoBack, back, replace }) },
      'expo-status-bar': { StatusBar: 'StatusBar' },
      'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (v: Props) => v }, Text: 'Text', View: 'View' },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
      '@/components/app-button': host('AppButton'),
      '@/components/app-symbol': host('AppSymbol'),
      '@/constants/theme': { SkillMatchTheme: { ui } },
      '@/lib/legal-document-sections': sections,
    });
    const document = {
      title: 'Terms and Conditions',
      version: '2026-09-v1',
      paragraphs: ['Bookings. After acceptance, both parties see a confirmed booking.', 'Creating a SkillMatch account does not by itself provide consent for unrelated research.'],
    };
    return { tree: LegalDocumentScreen({ document }) as El, back, replace, document };
  }

  it('is a flat reading column: title, version, headed sections, then Back', () => {
    const { tree } = legal(true);
    expect(tree.type).toBe('View');
    expect(ofType(tree, 'StatusBar')[0].props.style).toBe('dark');
    const scroll = ofType(tree, 'ScrollView')[0];
    expect(flat(scroll.props.contentContainerStyle)).toMatchObject({ paddingTop: 40, paddingBottom: 48 });
    const column = scroll.props.children;
    expect(flat(column.props.style)).toMatchObject({ maxWidth: 640, alignSelf: 'center' });
    const texts = ofType(tree, 'Text');
    expect(texts.map((node) => node.props.children).filter((child) => typeof child === 'string')).toEqual([
      'Back', 'Terms and Conditions', 'Bookings', 'After acceptance, both parties see a confirmed booking.',
      'Creating a SkillMatch account does not by itself provide consent for unrelated research.',
    ]);
    expect(texts.filter((node) => node.props.accessibilityRole === 'header').map((node) => node.props.children)).toEqual(['Terms and Conditions', 'Bookings']);
    expect(ofType(tree, 'AppButton')[0].props).toMatchObject({ label: 'Back', variant: 'secondary' });
  });

  it('renders the wording exactly as authored, 16sp body at a readable weight', () => {
    const { tree, document } = legal(true);
    const rendered = ofType(tree, 'Text').map((node) => node.props.children).filter((child) => typeof child === 'string');
    expect(`${rendered[2]}. ${rendered[3]}`).toBe(document.paragraphs[0]);
    const body = ofType(tree, 'Text').find((node) => node.props.children === rendered[3])!;
    expect(flat(body.props.style)).toMatchObject({ fontSize: 16, lineHeight: 24, color: ui.colors.textPrimary });
  });

  it('keeps both Back controls working, falling back to Login when there is no history', () => {
    const withHistory = legal(true);
    ofType(withHistory.tree, 'Pressable')[0].props.onPress();
    ofType(withHistory.tree, 'AppButton')[0].props.onPress();
    expect(withHistory.back).toHaveBeenCalledTimes(2);
    expect(withHistory.replace).not.toHaveBeenCalled();
    const bare = legal(false);
    ofType(bare.tree, 'Pressable')[0].props.onPress();
    expect(bare.replace).toHaveBeenCalledExactlyOnceWith('/login');
    expect(flat(ofType(bare.tree, 'Pressable')[0].props.style({ pressed: false })).minHeight).toBe(48);
  });
});
