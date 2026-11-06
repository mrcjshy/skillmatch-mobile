// @ts-expect-error -- Node-only inert component harness.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as cobaltMaterial from '../constants/cobalt-material';
import { SkillMatchTheme } from '@/constants/theme';

vi.mock('react-native', () => ({ Platform: { OS: 'android', select: (values: Record<string, unknown>) => values.android ?? values.default } }));

type Props = Record<string, unknown>;
type Element = { type: unknown; props: Props };

const CLIENT_ID = '11111111-2222-4333-8444-555555555555';

function harness(role: 'client' | 'worker' | 'administrator', options: { permission?: string; resetError?: { message: string } | null; version?: string | null } = {}) {
  const account = { id: CLIENT_ID, role, is_active: true, email: 'person@example.test' };
  const openSettings = vi.fn(async () => undefined);
  const setMapType = vi.fn();
  const clearRecents = vi.fn(async (_scope: { userId: string; isCurrent: () => boolean }) => undefined);
  const resetPassword = vi.fn(async (_email: string, _options: unknown) => ({ error: options.resetError ?? null }));
  const getPermissions = vi.fn(async () => ({ status: options.permission ?? 'granted' }));
  const appStateRemove = vi.fn();
  const state: unknown[] = []; let cursor = 0; const effects: (() => unknown)[] = [];
  const native = {
    ...Object.fromEntries(['View', 'Text', 'ScrollView', 'Pressable'].map(name => [name, name])),
    StyleSheet: { create: (styles: unknown) => styles },
    useWindowDimensions: () => ({ width: 411, height: 914, fontScale: 1 }),
    Linking: { openSettings },
    AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: appStateRemove })) },
  };
  const jsx = (type: unknown, props: Props): Element => typeof type === 'function' ? type(props) : { type, props };
  const cache: Record<string, Props> = {};
  function load(file: string): Props {
    if (cache[file]) return cache[file];
    const exports: Props = {}; cache[file] = exports;
    const seams: Record<string, unknown> = {
      react: { useState: (initial: unknown) => { const slot = cursor++; if (!(slot in state)) state[slot] = initial; return [state[slot], (value: unknown) => { state[slot] = value; }]; }, useCallback: (fn: unknown) => fn },
      'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      'expo-router': { useFocusEffect: (fn: () => unknown) => { effects.push(fn); } },
      'expo-constants': { __esModule: true, default: { expoConfig: options.version === null ? null : { version: options.version ?? '1.0.0' } } },
      'expo-notifications': { getPermissionsAsync: getPermissions },
      '@/components/app-symbol': { AppSymbol: 'SymbolView' },
      '@/constants/theme': { SkillMatchTheme },
      '@/lib/auth-recovery': { RECOVERY_REDIRECT_TO: 'skillmatchmobile://update-password', RECOVERY_TECHNICAL_FAILURE_COPY: 'Unable to send recovery instructions right now. Please try again later.' },
      '@/lib/map-type': { useMapType: () => 'map', setMapType },
      '@/lib/push-notifications': { inspectPermission: async (n: { getPermissionsAsync: () => Promise<{ status: string }> }) => { const s = (await n.getPermissionsAsync()).status; return s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined'; } },
      '@/lib/recent-locations': { clearRecentLocations: clearRecents },
      '@/lib/supabase': { supabase: { auth: { resetPasswordForEmail: resetPassword } } },
      '@/providers/account-provider': { useAccount: () => ({ account }) },
    };
    new Function('require', 'exports', ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)((name: string) => {
      if (name === '@/components/refinement-theme') return { useUiTheme: () => SkillMatchTheme.ui };
      if (name === '@/constants/cobalt-material') return cobaltMaterial;
      if (name in seams) return seams[name];
      if (name.startsWith('@/components/')) return load('src/' + name.slice(2) + '.tsx');
      throw new Error('Unexpected component dependency: ' + name);
    }, exports);
    return exports;
  }
  const Screen = load('src/components/settings-screen.tsx').SettingsScreen as (props: { role: string }) => Element;
  return {
    openSettings, setMapType, clearRecents, resetPassword, getPermissions, appStateRemove, native,
    effects: () => effects.splice(0).map(fn => fn()),
    render: () => { cursor = 0; effects.length = 0; return Screen({ role }); },
  };
}

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
const texts = (tree: Element) => nodes(tree).filter(node => node.type === 'Text').map(node => node.props.children);
const action = (tree: Element, label: string) => nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label);
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('Settings screen', () => {
  it('gives the Client notifications, permissions, map, recent locations, password and version', () => {
    const values = texts(harness('client').render());
    for (const title of ['Notifications', 'Phone permissions', 'Map', 'Clear recent locations', 'Account', 'Change password', 'About', 'App version', 'SkillMatch 1.0.0']) {
      expect(values).toContain(title);
    }
    expect(values.indexOf('Notifications')).toBeLessThan(values.indexOf('Map'));
    expect(values.indexOf('Map')).toBeLessThan(values.indexOf('Account'));
    expect(values.indexOf('Account')).toBeLessThan(values.indexOf('About'));
  });

  it('gives the Worker the same settings without recent locations or work status', () => {
    const values = texts(harness('worker').render());
    expect(values).toContain('Change password');
    expect(values).not.toContain('Clear recent locations');
    expect(values.join(' ')).not.toMatch(/Available|Busy|Work status/);
  });

  it('shows the notification permission and opens phone settings from both phone rows', async () => {
    const h = harness('worker', { permission: 'denied' });
    h.render(); expect(h.effects()).toHaveLength(1); await flush();
    const tree = h.render();
    expect(texts(tree)).toContain('Off · Turn on in phone settings');
    (action(tree, 'Notifications')!.props.onPress as () => void)();
    (action(tree, 'Phone permissions')!.props.onPress as () => void)();
    expect(h.openSettings).toHaveBeenCalledTimes(2);
    expect(h.native.AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    const on = harness('client', { permission: 'granted' }); on.render(); on.effects(); await flush();
    expect(texts(on.render())).toContain('On · Change in phone settings');
  });

  it('reads the permission again when the app comes back from phone settings, and stops listening on blur', async () => {
    const h = harness('client', { permission: 'granted' });
    h.render(); const [cleanup] = h.effects(); await flush();
    const listener = (h.native.AppState.addEventListener.mock.calls[0] as unknown as [string, (next: string) => void])[1];
    listener('background'); listener('active'); await flush();
    expect(h.getPermissions).toHaveBeenCalledTimes(2);
    (cleanup as () => void)();
    expect(h.appStateRemove).toHaveBeenCalledTimes(1);
  });

  it('sets the map style for every map', () => {
    const h = harness('client'); const tree = h.render();
    const segment = nodes(tree).find(node => node.props.accessibilityLabel === 'Map style' && node.props.accessibilityRole === 'radiogroup')!;
    expect(segment).toBeDefined();
    (action(tree, 'Satellite')!.props.onPress as () => void)();
    expect(h.setMapType).toHaveBeenCalledWith('satellite');
  });

  it("clears only the signed-in Client's recent locations", async () => {
    const h = harness('client');
    (action(h.render(), 'Clear recent locations')!.props.onPress as () => void)(); await flush();
    expect(h.clearRecents).toHaveBeenCalledTimes(1);
    expect(h.clearRecents.mock.calls[0][0].userId).toBe(CLIENT_ID);
    expect(texts(h.render())).toContain('Recent locations cleared');
  });

  it('sends the existing password-reset email to the account email and reports the result', async () => {
    const h = harness('client');
    (action(h.render(), 'Change password')!.props.onPress as () => void)(); await flush();
    expect(h.resetPassword).toHaveBeenCalledWith('person@example.test', { redirectTo: 'skillmatchmobile://update-password' });
    expect(texts(h.render())).toContain('Reset link sent to person@example.test');

    const failed = harness('worker', { resetError: { message: 'rate limited' } });
    (action(failed.render(), 'Change password')!.props.onPress as () => void)(); await flush();
    expect(texts(failed.render())).toContain('Unable to send recovery instructions right now. Please try again later.');
  });

  it('gives the Administrator Notifications, Change password and App version only (same as the web console)', () => {
    const h = harness('administrator');
    const values = texts(h.render());
    for (const title of ['Notifications', 'Account', 'Change password', 'About', 'App version', 'SkillMatch 1.0.0']) expect(values).toContain(title);
    for (const hidden of ['Phone permissions', 'Map', 'Satellite', 'Clear recent locations']) expect(values).not.toContain(hidden);
  });

  it('shows only the app name when the version is unknown', () => {
    expect(texts(harness('worker', { version: null }).render())).toContain('SkillMatch');
  });
});
