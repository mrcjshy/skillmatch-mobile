// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;
type El = { type: any; props: Props };

const nodes = (tree: any): El[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const ofType = (tree: any, type: string) => nodes(tree).filter((node) => node.type === type);
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

const host = (...names: string[]) => Object.fromEntries(names.map((name) => [name, name]));
const jsx = (type: any, props: Props) => (typeof type === 'function' ? type(props) : { type, props });

function compile(file: string, modules: Props): Props {
  const exports: Props = {};
  new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name: string) => { if (!(name in modules)) throw Error('Unexpected import: ' + name); return modules[name]; }, exports);
  return exports;
}

const recovery = compile('src/lib/auth-recovery.ts', {});
const consentLib = compile('src/lib/user-consent.ts', {
  './legal-documents': compile('src/lib/legal-documents.ts', {}),
  './supabase': { supabase: {} },
});

/** Renders a real screen with press-by-press state and ref handles; leaf components are host elements. */
function screen(file: string, extra: Props) {
  const slots: any[] = [];
  const refs: { current: any }[] = [];
  let cursor = 0;
  let refCursor = 0;
  const modules = {
    react: {
      useState: (initial: any) => {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
        return [slots[slot], (next: any) => { slots[slot] = typeof next === 'function' ? next(slots[slot]) : next; }];
      },
      useRef: (initial: any) => {
        const slot = refCursor++;
        if (!(slot in refs)) refs[slot] = { current: initial };
        return refs[slot];
      },
      useEffect: () => undefined,
      useMemo: (factory: () => any) => factory(),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: (v: any) => v }, Text: 'Text', View: 'View', ActivityIndicator: 'ActivityIndicator' },
    '@/components/refinement-theme': { useUiTheme: () => ({ colors: {}, type: {}, spacing: {} }), RefinementThemeProvider: ({ children }: Props) => children },
    '@/components/app-button': host('AppButton'),
    '@/components/app-divider': host('AppDivider'),
    '@/components/app-field': host('AppField'),
    '@/components/auth-screen': { ...host('AuthScreen', 'AuthSection', 'AuthLink'), useAuthScroll: () => ({ scrollRef: { current: null }, focusField: (ref: any) => ref.current?.focus?.() }) },
    '@/components/form-message': host('FormMessage'),
    '@/components/password-field': host('PasswordField'),
    ...extra,
  };
  const exports = compile(file, modules);
  const render = (): El => { cursor = 0; refCursor = 0; return exports.default(); };
  const FIELDS = ['AppField', 'PasswordField'];
  const field = (label: string) => nodes(render()).find((node) => FIELDS.includes(node.type) && node.props.label === label)!;
  const button = (label: string, tree: any = render()) => nodes(tree).find((node) => node.type === 'AppButton' && node.props.label === label)!;
  const type = (label: string, value: string) => field(label).props.onChangeText(value);
  const messages = (tone?: string) => ofType(render(), 'FormMessage').filter((node) => !tone || node.props.tone === tone).map((node) => node.props.message);
  return { render, field, button, type, messages, refs };
}

describe('Login', () => {
  function login(session: Props = {}, supabaseResult: any = { error: null }) {
    const push = vi.fn();
    const signInWithPassword = vi.fn(async () => supabaseResult);
    const h = screen('src/app/(auth)/login.tsx', {
      'expo-router': { useRouter: () => ({ push }) },
      '@/lib/supabase': { supabase: { auth: { signInWithPassword } } },
      '@/providers/session-provider': { useSession: () => ({ session: null, isSessionLoading: false, sessionError: null, ...session }) },
    });
    return { ...h, push, signInWithPassword };
  }
  const focusable = (h: ReturnType<typeof login>, label: string) => {
    const focus = vi.fn();
    (h.field(label).props.inputRef as { current: any }).current = { focus };
    return focus;
  };

  it('is one form with a single primary Sign in; recovery and registration are subordinate', () => {
    const h = login();
    const tree = h.render();
    expect(tree.type).toBe('AuthScreen');
    expect(tree.props.title).toBe('Sign in');
    expect(nodes(tree).filter((node) => node.type === 'AppField' || node.type === 'PasswordField').map((node) => node.props.label)).toEqual(['Email', 'Password']);
    expect(h.field('Password').type).toBe('PasswordField');
    const primary = ofType(tree, 'AppButton');
    expect(primary.map((node) => [node.props.label, node.props.variant ?? 'primary'])).toEqual([['Sign in', 'primary']]);
    expect(nodes(tree).find((node) => node.type === 'AuthLink')!.props).toMatchObject({ href: '/forgot-password', children: 'Forgot password?' });
    const footerButton = ofType(tree.props.footer, 'AppButton')[0];
    expect(footerButton.props).toMatchObject({ label: 'Create an account', variant: 'secondary' });
    footerButton.props.onPress();
    expect(h.push).toHaveBeenCalledExactlyOnceWith('/register');
  });

  it('puts a missing email or password beside its field and focuses it, without calling Auth', async () => {
    const h = login();
    const focusEmail = focusable(h, 'Email');
    await h.button('Sign in').props.onPress();
    expect(h.field('Email').props.errorText).toBe('Please enter your email.');
    expect(focusEmail).toHaveBeenCalledTimes(1);
    h.type('Email', '  person@example.test ');
    const focusPassword = focusable(h, 'Password');
    await h.button('Sign in').props.onPress();
    expect(h.field('Email').props.errorText).toBeUndefined();
    expect(h.field('Password').props.errorText).toBe('Please enter your password.');
    expect(focusPassword).toHaveBeenCalledTimes(1);
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with the trimmed email and unchanged password, then confirms success', async () => {
    const h = login();
    h.type('Email', '  person@example.test ');
    h.type('Password', 'example-password');
    await h.button('Sign in').props.onPress();
    expect(h.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email: 'person@example.test', password: 'example-password' });
    expect(h.messages('success')).toEqual(['Signed in successfully.']);
    expect(h.messages('error')).toEqual([]);
  });

  it.each([[400], [401], [422]])('reveals nothing about the account on a %s failure', async (status) => {
    const h = login({}, { error: { status, message: 'Invalid login credentials: no such user' } });
    h.type('Email', 'person@example.test'); h.type('Password', 'wrong');
    await h.button('Sign in').props.onPress();
    expect(h.messages('error')).toEqual(['Invalid email or password.']);
  });

  it('shows the provider message for other failures and a connection message when the call throws', async () => {
    const other = login({}, { error: { status: 500, message: 'Service unavailable.' } });
    other.type('Email', 'a@example.test'); other.type('Password', 'x');
    await other.button('Sign in').props.onPress();
    expect(other.messages('error')).toEqual(['Service unavailable.']);
    const thrown = login();
    thrown.signInWithPassword.mockRejectedValueOnce(new Error('offline'));
    thrown.type('Email', 'a@example.test'); thrown.type('Password', 'x');
    await thrown.button('Sign in').props.onPress();
    expect(thrown.messages('error')).toEqual(['Sign in failed. Please check your connection and try again.']);
  });

  it('keeps loading and disabled behaviour explicit while a sign-in is in flight and blocks a second submit', async () => {
    const h = login();
    let release!: (value: any) => void;
    h.signInWithPassword.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    h.type('Email', 'a@example.test'); h.type('Password', 'x');
    const pending = h.button('Sign in').props.onPress();
    expect(h.button('Sign in').props.loading).toBe(true);
    expect(h.field('Email').props.disabled).toBe(true);
    expect(h.field('Password').props.disabled).toBe(true);
    await h.button('Sign in').props.onPress();
    release({ error: null }); await pending; await flush();
    expect(h.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(h.button('Sign in').props.loading).toBe(false);
  });

  it('only mentions the session when there is something to say, and hints autofill correctly', () => {
    expect(ofType(login().render(), 'FormMessage')).toHaveLength(0);
    expect(login({ isSessionLoading: true }).messages('info')).toEqual(['Checking session…']);
    expect(login({ sessionError: new Error('x') }).messages('error')).toEqual(['Session restoration error.']);
    const h = login();
    expect(h.field('Email').props).toMatchObject({ autoComplete: 'email', keyboardType: 'email-address', autoCapitalize: 'none' });
    expect(h.field('Password').props).toMatchObject({ autoComplete: 'current-password' });
  });
});

describe('Forgot password', () => {
  function forgot(result: any = { error: null }) {
    const resetPasswordForEmail = vi.fn(async () => result);
    const h = screen('src/app/(auth)/forgot-password.tsx', {
      '@/lib/auth-recovery': recovery,
      '@/lib/supabase': { supabase: { auth: { resetPasswordForEmail } } },
    });
    return { ...h, resetPasswordForEmail };
  }

  it('asks for one email, with Back to sign in as the only other path', () => {
    const tree = forgot().render();
    expect(tree.props.title).toBe('Reset your password');
    expect(ofType(tree, 'AppField').map((node) => node.props.label)).toEqual(['Email']);
    expect(ofType(tree, 'AppButton').map((node) => node.props.label)).toEqual(['Send recovery instructions']);
    expect(ofType(tree, 'AuthLink')[0].props).toMatchObject({ href: '/login', children: 'Back to sign in' });
  });

  it('validates beside the field and focuses it before any request', async () => {
    const h = forgot();
    const focus = vi.fn();
    (h.field('Email').props.inputRef as { current: any }).current = { focus };
    await h.button('Send recovery instructions').props.onPress();
    expect(h.field('Email').props.errorText).toBe('Please enter your email.');
    h.type('Email', 'not-an-email');
    await h.button('Send recovery instructions').props.onPress();
    expect(h.field('Email').props.errorText).toBe('Please enter a valid email.');
    expect(focus).toHaveBeenCalledTimes(2);
    expect(h.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('shows the same success copy whether or not the account exists, and a technical failure otherwise', async () => {
    const ok = forgot();
    ok.type('Email', ' person@example.test ');
    await ok.button('Send recovery instructions').props.onPress();
    expect(ok.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith('person@example.test', { redirectTo: recovery.RECOVERY_REDIRECT_TO });
    expect(ok.messages('success')).toEqual([recovery.RECOVERY_SUCCESS_COPY]);

    const broken = forgot({ error: { status: 500, message: 'down' } });
    broken.type('Email', 'person@example.test');
    await broken.button('Send recovery instructions').props.onPress();
    expect(broken.messages('error')).toEqual([recovery.RECOVERY_TECHNICAL_FAILURE_COPY]);
    expect(broken.messages('success')).toEqual([]);
  });
});

describe('Update password', () => {
  function update(session: Props = {}, updateResult: any = { error: null }) {
    const updateUser = vi.fn(async () => updateResult);
    const markRecoveryPasswordUpdated = vi.fn();
    const clearRecoveryAuthorization = vi.fn();
    const sessionValue = {
      session: { user: { id: 'u1' } }, recoveryStatus: 'ready', recoveryUserId: 'u1', recoveryError: null,
      canUpdateRecoveryPassword: true, clearRecoveryAuthorization, markRecoveryPasswordUpdated, ...session,
    };
    const h = screen('src/app/update-password.tsx', {
      '@/lib/auth-recovery': { ...recovery, isRecoveryPasswordUpdateAllowed: () => true },
      '@/lib/supabase': { supabase: { auth: { updateUser } } },
      '@/providers/session-provider': { useSession: () => sessionValue },
    });
    return { ...h, updateUser, markRecoveryPasswordUpdated, clearRecoveryAuthorization };
  }

  it('titles each state plainly and offers Continue for the terminal ones', () => {
    expect(update().render().props.title).toBe('Choose a new password');
    expect(update({ canUpdateRecoveryPassword: false, recoveryStatus: 'processing' }).render().props.title).toBe('Checking your link');
    const done = update({ canUpdateRecoveryPassword: false, recoveryStatus: 'complete' });
    expect(done.render().props.title).toBe('Password updated');
    expect(done.messages('success')).toEqual(['Your password has been updated.']);
    done.button('Continue').props.onPress();
    expect(done.clearRecoveryAuthorization).toHaveBeenCalledTimes(1);
    const invalid = update({ canUpdateRecoveryPassword: false, recoveryStatus: 'error', recoveryError: 'This link expired.' });
    expect(invalid.render().props.title).toBe('Link not valid');
    expect(invalid.messages('error')).toEqual(['This link expired.']);
    expect(ofType(invalid.render(), 'AppButton').map((node) => node.props.label)).toEqual(['Continue']);
  });

  it('shows the password rule before any failure and reports problems beside the right field', async () => {
    const h = update();
    expect(h.field('New password').props.helperText).toBe(`At least ${recovery.RECOVERY_PASSWORD_MIN_LENGTH} characters.`);
    await h.button('Update password').props.onPress();
    expect(h.field('New password').props.errorText).toBe('Please enter a new password.');
    h.type('New password', 'abc');
    await h.button('Update password').props.onPress();
    expect(h.field('New password').props.errorText).toBe(`Password must be at least ${recovery.RECOVERY_PASSWORD_MIN_LENGTH} characters.`);
    h.type('New password', 'long-enough');
    await h.button('Update password').props.onPress();
    expect(h.field('Confirm new password').props.errorText).toBe('Please confirm your new password.');
    h.type('Confirm new password', 'different');
    await h.button('Update password').props.onPress();
    expect(h.field('Confirm new password').props.errorText).toBe('Passwords do not match.');
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('updates once, clears the fields and marks recovery complete; a failure stays a form message', async () => {
    const ok = update();
    ok.type('New password', 'long-enough'); ok.type('Confirm new password', 'long-enough');
    await ok.button('Update password').props.onPress();
    expect(ok.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'long-enough' });
    expect(ok.markRecoveryPasswordUpdated).toHaveBeenCalledTimes(1);
    expect(ok.field('New password').props.value).toBe('');

    const failed = update({}, { error: { message: 'weak' } });
    failed.type('New password', 'long-enough'); failed.type('Confirm new password', 'long-enough');
    await failed.button('Update password').props.onPress();
    expect(failed.messages('error')).toEqual(['Unable to update your password right now. Please try again later.']);
    expect(failed.markRecoveryPasswordUpdated).not.toHaveBeenCalled();
  });
});

describe('Legal consent', () => {
  function consent(overrides: Props = {}) {
    const replace = vi.fn();
    const recordMyConsent = vi.fn(async () => {});
    const refreshConsent = vi.fn(async () => {});
    const h = screen('src/app/(auth)/legal-consent.tsx', {
      'expo-router': { useRouter: () => ({ replace }) },
      '@/components/consent-check': host('ConsentCheck'),
      '@/lib/user-consent': { ...consentLib, recordMyConsent, ...overrides },
      '@/providers/account-provider': { useAccount: () => ({ refreshConsent }) },
    });
    const checks = () => ofType(h.render(), 'ConsentCheck');
    const sticky = () => h.render().props.stickyFooter;
    const save = () => ofType(sticky(), 'AppButton')[0];
    return { ...h, replace, recordMyConsent, refreshConsent, checks, sticky, save };
  }

  it('is a reading screen: two named consents, the action pinned below, links to both documents', () => {
    const h = consent();
    const tree = h.render();
    expect(tree.props.title).toBe('Terms and privacy');
    expect(h.checks().map((node) => [node.props.accessibilityLabel, node.props.href, node.props.checked])).toEqual([
      ['I agree to the Terms and Conditions', '/terms', false],
      ['I acknowledge the Privacy Policy', '/privacy', false],
    ]);
    expect(h.save().props).toMatchObject({ label: 'Save and continue' });
    expect(ofType(tree, 'AppButton')).toHaveLength(0); // the only action lives in the sticky footer
  });

  it('requires both agreements before anything is recorded, and says so next to the action', async () => {
    const h = consent();
    h.save().props.onPress(); await flush();
    expect(ofType(h.sticky(), 'FormMessage')[0].props.message).toBe(consentLib.CONSENT_COPY.required);
    h.checks()[0].props.onToggle();
    h.save().props.onPress(); await flush();
    expect(h.recordMyConsent).not.toHaveBeenCalled();
  });

  it('records, refreshes and replaces to the dispatcher in that order once both are accepted', async () => {
    const h = consent();
    h.checks().forEach((node) => node.props.onToggle());
    expect(h.checks().map((node) => node.props.checked)).toEqual([true, true]);
    h.save().props.onPress(); await flush();
    expect(h.recordMyConsent).toHaveBeenCalledTimes(1);
    expect(h.refreshConsent).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('keeps the form and shows the mapped error when saving fails', async () => {
    const h = consent();
    h.recordMyConsent.mockRejectedValueOnce(new Error('network'));
    h.checks().forEach((node) => node.props.onToggle());
    h.save().props.onPress(); await flush();
    expect(h.replace).not.toHaveBeenCalled();
    expect(ofType(h.sticky(), 'FormMessage')).toHaveLength(1);
    expect(h.checks().map((node) => node.props.checked)).toEqual([true, true]);
  });
});

describe('Verify email resend action', () => {
  it('shows the countdown as a flat disabled text action and keeps the live Verify action primary', () => {
    const h = screen('src/app/(auth)/verify-email.tsx', {
      'expo-router': { useLocalSearchParams: () => ({ email: 'Sample@Example.test ' }) },
      '@/lib/email-verification': compile('src/lib/email-verification.ts', {}),
      '@/lib/phone-verification': { isPhoneOtpEnabled: () => false },
      '@/lib/supabase': { supabase: { auth: {} } },
      '@/lib/user-consent': { persistCurrentLegalConsentAfterSignup: async () => {} },
      '@/providers/account-provider': { useAccount: () => ({ retryAccountBootstrap: () => {} }) },
    });
    const tree = h.render();
    expect(tree.props.description).toContain('sample@example.test');
    const [verify, resend] = ofType(tree, 'AppButton');
    expect(verify.props).toMatchObject({ label: 'Verify email', disabled: false });
    expect(verify.props.variant ?? 'primary').toBe('primary');
    expect(resend.props.variant).toBe('ghost');
    expect(resend.props.disabled).toBe(true);
    expect(resend.props.label).toMatch(/^Resend code in \d+s$/);
  });
});
