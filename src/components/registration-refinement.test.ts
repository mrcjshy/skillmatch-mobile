// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { SkillMatchTheme } from '@/constants/theme';
import * as phone from '@/lib/philippine-phone';
import { CONSENT_COPY, hasRequiredLegalAcceptance } from '@/lib/user-consent';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (values: Record<string, unknown>) => values.android ?? values.default } }));

type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}

const FIELD_TYPES = ['AppField', 'PasswordField'];

/**
 * Runs the real registration screen with inert auth. Layout shells (AuthScreen) and leaf controls
 * are string host elements so this file pins what the screen decides: structure per role, field
 * set, validation placement and the exact signup contract. The shell itself is covered in
 * auth-screen.test.ts.
 */
function harness() {
  const signUp = vi.fn(async (_payload: unknown): Promise<{ error: null | { message: string } }> => ({ error: null }));
  const replace = vi.fn();
  const state: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let cursor = 0;
  let refCursor = 0;
  const jsx = (type: unknown, props: Props): unknown => typeof type === 'function' ? type(props) : { type, props };
  const exports: Record<string, () => Element> = {};
  const host = (...names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => {
        const slot = cursor++;
        if (!(slot in state)) state[slot] = initial;
        return [state[slot], (value: unknown) => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }];
      },
      useRef: (initial: unknown) => {
        const slot = refCursor++;
        if (!(slot in refs)) refs[slot] = { current: initial };
        return refs[slot];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', StyleSheet: { create: (styles: unknown) => styles } },
    'expo-router': { useRouter: () => ({ replace }) },
    '@/components/refinement-theme': { useUiTheme: () => SkillMatchTheme.ui, RefinementThemeProvider: ({ children }: Props) => children },
    '@/components/app-button': host('AppButton'),
    '@/components/app-divider': host('AppDivider'),
    '@/components/app-field': host('AppField'),
    '@/components/auth-screen': { ...host('AuthScreen', 'AuthSection', 'AuthLink'), useAuthScroll: () => ({ scrollRef: { current: null }, focusField: (ref: { current: { focus?: () => void } | null }) => ref.current?.focus?.() }) },
    '@/components/consent-check': host('ConsentCheck'),
    '@/components/form-message': host('FormMessage'),
    '@/components/password-field': host('PasswordField'),
    '@/components/radio-row': host('RadioRow'),
    '@/components/step-list': host('StepList'),
    '@/lib/supabase': { supabase: { auth: { signUp } } },
    '@/lib/philippine-phone': phone,
    '@/lib/user-consent': { CONSENT_COPY, hasRequiredLegalAcceptance },
  };
  const compiled = ts.transpileModule(readFileSync('src/app/(auth)/register.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error('Unexpected dependency: ' + name);
    return modules[name];
  }, exports);
  const render = () => { cursor = 0; refCursor = 0; return exports.default(); };
  const fields = () => nodes(render()).filter(node => FIELD_TYPES.includes(node.type as string));
  const field = (label: string) => fields().find(node => node.props.label === label)!;
  const choose = (role: string) => {
    const option = nodes(render()).find(node => node.type === 'RadioRow' && node.props.label === role)!;
    (option.props.onPress as () => void)();
  };
  const fill = () => {
    for (const [label, value] of [['Full name', '  Alex Santos  '], ['Phone number', '09171234567'], ['Email', ' alex@example.test '], ['Password', 'example-password'], ['Confirm password', 'example-password']]) {
      (field(label).props.onChangeText as (value: string) => void)(value);
    }
  };
  const consents = () => nodes(render()).filter(node => node.type === 'ConsentCheck');
  const consent = () => consents().forEach(node => (node.props.onToggle as () => void)());
  const submit = () => (nodes(render()).find(node => node.type === 'AppButton' && node.props.label === 'Create account')!.props.onPress as () => Promise<void>)();
  /** Every message the person can read: form-level messages plus per-field error text. */
  const messages = () => {
    const tree = render();
    return [
      ...nodes(tree).filter(node => node.type === 'FormMessage').map(node => node.props.message),
      ...nodes(tree).filter(node => FIELD_TYPES.includes(node.type as string)).map(node => node.props.errorText),
    ].filter(Boolean);
  };
  return { render, choose, fill, consent, consents, field, fields, submit, messages, signUp, replace };
}

const titles = (tree: Element) => nodes(tree).filter(node => node.type === 'AuthSection').map(node => node.props.title);

describe('role-specific registration refinement with inert auth', () => {
  it('asks for the role first and shows no form, consent or create action until one is chosen', () => {
    const h = harness();
    const tree = h.render(), flat = nodes(tree);
    expect(tree.type).toBe('AuthScreen');
    expect(tree.props.title).toBe('Create your account');
    expect(flat.filter(node => node.type === 'RadioRow').map(node => node.props.label)).toEqual(['Worker', 'Client']);
    expect(flat.filter(node => node.type === 'RadioRow').every(node => node.props.selected === false)).toBe(true);
    expect(h.fields()).toHaveLength(0);
    expect(h.consents()).toHaveLength(0);
    expect(flat.some(node => node.type === 'AppButton')).toBe(false);
    expect(nodes(tree.props.footer).some(node => node.type === 'AuthLink' && node.props.dismissTo === true && node.props.href === '/login')).toBe(true);
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it('gives Worker its real onboarding path, grouped fields and the supported field set', () => {
    const h = harness(); h.choose('Worker');
    const tree = h.render(), flat = nodes(tree);
    expect(tree.props.title).toBe('Join as a Worker');
    expect(titles(tree)).toEqual(['Your path as a Worker', 'About you', 'Sign-in details', 'Terms and privacy']);
    const path = flat.find(node => node.type === 'StepList')!.props.steps as { label: string; state: string }[];
    expect(path.map(step => step.label)).toEqual(['Create your account', 'Confirm your email', 'Submit a valid ID', 'Set up your work profile']);
    expect(path.map(step => step.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(flat.findIndex(node => node.type === 'RadioRow')).toBeLessThan(flat.findIndex(node => FIELD_TYPES.includes(node.type as string)));
    expect(h.fields().map(node => node.props.label)).toEqual(['Full name', 'Phone number', 'Email', 'Password', 'Confirm password']);
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it('keeps Client concise, excludes the Worker path, and preserves typed values on role change', () => {
    const h = harness(); h.choose('Worker'); h.fill(); h.choose('Client');
    const tree = h.render();
    expect(tree.props.title).toBe('Join as a Client');
    expect(titles(tree)).toEqual(['Your details', 'Terms and privacy']);
    expect(nodes(tree).some(node => node.type === 'StepList')).toBe(false);
    expect(h.fields().map(node => node.props.label)).toEqual(['Full name', 'Phone number', 'Email', 'Password', 'Confirm password']);
    expect(h.field('Full name').props.value).toBe('  Alex Santos  ');
    expect(h.signUp).not.toHaveBeenCalled();
  });

  it('gives the sensitive fields the right keyboard, autofill and secure-entry hints', () => {
    const h = harness(); h.choose('Client');
    expect(h.field('Email').props).toMatchObject({ keyboardType: 'email-address', autoComplete: 'email', autoCapitalize: 'none' });
    expect(h.field('Phone number').props).toMatchObject({ keyboardType: 'phone-pad', autoComplete: 'tel' });
    expect(h.field('Password').props).toMatchObject({ autoComplete: 'new-password' });
    expect(h.field('Confirm password').props).toMatchObject({ autoComplete: 'new-password' });
    expect(h.field('Password').type).toBe('PasswordField');
    expect(h.field('Confirm password').type).toBe('PasswordField');
  });

  it.each(['Worker', 'Client'])('preserves the exact %s signup contract and replacement to email verification', async (role) => {
    const h = harness(); h.choose(role); h.fill(); h.consent(); await h.submit();
    expect(h.signUp).toHaveBeenCalledExactlyOnceWith({ email: 'alex@example.test', password: 'example-password', options: { data: { registration_full_name: 'Alex Santos', registration_phone: '+639171234567', registration_role_intent: role.toLowerCase() } } });
    expect(h.replace).toHaveBeenCalledExactlyOnceWith({ pathname: '/verify-email', params: { email: 'alex@example.test' } });
  });

  it('keeps required legal acceptance and account errors ahead of auth submission, under the control they describe', async () => {
    const h = harness(); h.choose('Client'); h.fill(); await h.submit();
    expect(h.signUp).not.toHaveBeenCalled(); expect(h.messages()).toEqual([CONSENT_COPY.required]);
    h.consent(); (h.field('Confirm password').props.onChangeText as (s: string) => void)('different'); await h.submit();
    expect(h.signUp).not.toHaveBeenCalled(); expect(h.messages()).toEqual(['Passwords do not match.']);
    expect(h.field('Confirm password').props.errorText).toBe('Passwords do not match.');
    expect(h.field('Password').props.errorText).toBeUndefined();
  });

  it('reports the first missing field beside it and moves focus to it', async () => {
    const h = harness(); h.choose('Worker');
    const focus = vi.fn();
    (h.field('Full name').props.inputRef as { current: unknown }).current = { focus };
    await h.submit();
    expect(h.field('Full name').props.errorText).toBe('Please enter your full name.');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(h.signUp).not.toHaveBeenCalled();
    h.fill();
    (h.field('Phone number').props.onChangeText as (s: string) => void)('123');
    await h.submit();
    expect(h.field('Phone number').props.errorText).toBe('Enter a valid Philippine mobile number, such as +63 917 123 4567.');
  });

  it('surfaces a mocked auth failure as a form message without routing or adding registration fields', async () => {
    const h = harness(); h.choose('Worker'); h.fill(); h.consent(); h.signUp.mockResolvedValueOnce({ error: { message: 'Account could not be created.' } });
    await h.submit(); expect(h.replace).not.toHaveBeenCalled(); expect(h.messages()).toEqual(['Account could not be created.']);
    expect(h.fields()).toHaveLength(5);
  });
});
