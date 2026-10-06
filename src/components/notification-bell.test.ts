// @ts-expect-error -- Node-only harness.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node-only harness.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
type Props = Record<string, any>;
const flat = (s: any): Props => Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean).map(flat)) : s || {};
function render(role: string) {
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
  const { IconCircle } = load('src/components/icon-circle.tsx', { 'react-native': native,
    'react/jsx-runtime': { jsx, jsxs: jsx }, '@/constants/theme': theme });
  const { NotificationBell } = load('src/components/notification-bell.tsx', {
    'react-native': native, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/constants/theme': theme,
    'expo-router': { useRouter: () => ({ push: (destination: string) => pushes.push(destination) }) },
    'expo-symbols': { SymbolView: 'SymbolView' }, '@/components/icon-circle': { IconCircle },
  });
  const element = NotificationBell({ role });
  return { element, pushes, circle: IconCircle(element.props.children.props) };
}
it('gives the actual bell 48 by 48 minima while preserving icon and hit slop', () => {
  const { element } = render('worker');
  expect(flat(element.props.style({ pressed: false }))).toMatchObject({ minHeight: 48, minWidth: 48 });
  expect(element.props.hitSlop).toBe(8);
  expect(element.props.children.props).toMatchObject({ size: 40, variant: 'neutral' });
  expect(element.props.children.props.children.props).toMatchObject({ size: 24, tintColor: '#163300' });
});
it('checks symbol contrast against the actual nested circle surface in both press states', () => {
  const { element, circle } = render('worker');
  const lum = (c: string) => c.slice(1).match(/../g)!.map(x => parseInt(x,16)/255).map(x => x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  for (const pressed of [false,true]) {
    const outer = flat(element.props.style({ pressed }));
    const bg = flat(circle.props.style).backgroundColor || outer.backgroundColor;
    const tint = circle.props.children.props.tintColor;
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
  expect(pressed.backgroundColor).toBe('#E2F6D5');
  expect(pressed.opacity).toBeUndefined();
  expect(pressed.backgroundColor).not.toBe(rest.backgroundColor);
  expect(flat(element.props.style({ pressed: false }))).toEqual(rest);
});
