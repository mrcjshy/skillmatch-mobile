// @ts-expect-error -- Node-only harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
type Props = Record<string, any>;
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s || {};
function render(role: string, unread = false) {
  const pushes: string[] = [];
  const native = { Platform: { select: (v: Props) => v.android ?? v.default }, StyleSheet: { create: (s: Props) => s }, Pressable: 'Pressable', View: 'View' };
  const jsx = (type: any, props: Props) => ({ type, props });
  const load = (file: string, modules: Props) => {
    const exports: Props = {};
    runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { exports, require: (name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; } });
    return exports;
  };
  const theme = load('src/constants/theme.ts', { 'react-native': native, '@/global.css': {} });
  const { NotificationBell } = load('src/components/notification-bell.tsx', {
    'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/constants/theme': theme,
    'expo-router': { useRouter: () => ({ push: (destination: string) => pushes.push(destination) }) },
    'expo-symbols': { SymbolView: 'SymbolView' },
    '@/hooks/use-unread-notifications': { useUnreadNotifications: () => unread },
    '@/components/app-symbol': { AppSymbol: 'SymbolView' },
  });
  const element = NotificationBell({ role });
  return { element, pushes, colors: theme.SkillMatchTheme.ui.colors };
}
it('gives the actual bell 48 by 48 minima while preserving icon and hit slop', () => {
  const { element } = render('worker');
  expect(flat(element.props.style({ pressed: false }))).toMatchObject({ minHeight: 48, minWidth: 48 });
  expect(element.props.hitSlop).toBe(8);
  expect(element.props.children[0].props).toMatchObject({ size: 24, tintColor: '#1B1F24', name: { android: 'notifications_none', ios: 'bell' } });
});
it('checks symbol contrast against the actual header surface in both press states', () => {
  const { element, colors } = render('worker');
  const lum = (c: string) => c.slice(1).match(/../g)!.map(x => parseInt(x,16)/255).map(x => x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  for (const pressed of [false,true]) {
    const outer = flat(element.props.style({ pressed }));
    const bg = outer.backgroundColor || colors.canvas;
    const tint = element.props.children[0].props.tintColor;
    const ratio = (Math.max(lum(tint),lum(bg))+.05)/(Math.min(lum(tint),lum(bg))+.05);
    expect(ratio).toBeGreaterThanOrEqual(3);
    console.log('Bell icon contrast', tint,bg,ratio);
  }
});
for (const role of ['worker', 'client']) it(`preserves ${role} navigation and accessible identity`, () => {
  const { element, pushes } = render(role);
  expect(element.props).toMatchObject({ accessibilityLabel: 'Notifications', accessibilityRole: 'button' });
  element.props.onPress();
  expect(pushes).toEqual([`/${role}/notifications`]);
  expect(element.props.disabled).toBeUndefined();
});
it('uses selected pressed feedback and restores resting presentation without opacity', () => {
  const { element } = render('client');
  const rest = flat(element.props.style({ pressed: false }));
  const pressed = flat(element.props.style({ pressed: true }));
  expect(pressed.backgroundColor).toBe('#E9EEFC');
  expect(pressed.opacity).toBeUndefined();
  expect(pressed.backgroundColor).not.toBe(rest.backgroundColor);
  expect(flat(element.props.style({ pressed: false }))).toEqual(rest);
});

for (const role of ['worker', 'client', 'admin']) {
  it(`hides the ${role} dot when the authoritative unread result is zero`, () => {
    const { element } = render(role, false);
    expect(element.props.children.filter((node: any) => node?.props.testID === 'notification-unread-dot')).toHaveLength(0);
    expect(element.props.accessibilityLabel).toBe('Notifications');
  });
  it(`shows one red ${role} dot with unread notifications and speaks the state`, () => {
    const { element, colors } = render(role, true);
    const dots = element.props.children.filter((node: any) => node?.props.testID === 'notification-unread-dot');
    expect(dots).toHaveLength(1);
    expect(flat(dots[0].props.style)).toMatchObject({ width: 8, height: 8, backgroundColor: colors.error });
    expect(dots[0].props).toMatchObject({ accessible: false, pointerEvents: 'none' });
    expect(element.props.accessibilityLabel).toBe('Notifications, unread notifications');
    expect(dots[0].props.children).toBeUndefined();
  });
}
