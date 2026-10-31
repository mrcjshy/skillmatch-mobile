// @ts-expect-error -- Node-only lifecycle harness; Android captures verify native rendering.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Props = Record<string, any>;

/** Execute the real hook with recording framework seams, including effect dependency changes. */
function harness() {
  let focused = true, reduced = false, foreground = true;
  let cursor = 0;
  const values: Props[] = [];
  const effects: { deps: any[]; cleanup?: () => void }[] = [];
  const listeners = new Set<(state: string) => void>();
  const pending: (() => void)[] = [];
  const cancel = vi.fn();
  const animate = (kind: string) => (...args: any[]) => ({ kind, args });
  const effect = (run: () => (() => void) | undefined, deps: any[]) => {
    const i = cursor++, previous = effects[i];
    if (previous && deps.every((dep, index) => dep === previous.deps[index])) return;
    pending.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: run() }; });
  };
  const modules: Props = {
    'expo-router': { useFocusEffect: (run: any) => effect(() => focused ? run() : undefined, [focused, ...run.deps]) },
    react: {
      useState: () => [foreground, (next: boolean) => { foreground = next; }],
      useEffect: effect,
      useCallback: (run: Props, deps: any[]) => Object.assign(run, { deps }),
    },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_: string, listener: (state: string) => void) => {
      listeners.add(listener); return { remove: () => listeners.delete(listener) };
    } }, StyleSheet: { create: (styles: Props) => styles } },
    'react-native-reanimated': {
      Easing: { linear: 'linear' },
      ReduceMotion: { Never: 'never' }, cancelAnimation: cancel,
      useSharedValue: (initial: number) => {
        const i = cursor++;
        return values[i] ??= { current: initial, set: vi.fn((next: any) => { values[i].current = next; }), get: () => values[i].current };
      },
      useAnimatedStyle: (run: () => Props) => run(),
      withTiming: animate('timing'), withRepeat: animate('repeat'),
    },
    '@/components/motion': {}, '@/components/refinement-theme': {}, '@/lib/location-map-view': {},
    '@/constants/motion': { MotionTokens: { scale: { reveal: 0.88 }, duration: { emphasized: 320, large: 240 } } },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => reduced },
    'react/jsx-runtime': {},
  };
  const exported: Props = {};
  const source = ts.transpileModule(readFileSync('src/components/map-pin-label.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', source)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected import ${id}`);
    return modules[id];
  }, exported);
  return {
    values, listeners, cancel,
    render(stale = false, paused = false) {
      cursor = 0;
      const styles = exported.useDestinationPinMotion(stale, paused);
      pending.splice(0).forEach(run => run());
      return styles;
    },
    reduce: (next: boolean) => { reduced = next; },
    focus: (next: boolean) => { focused = next; },
    appState: (state: string) => { listeners.forEach(listener => listener(state)); },
    unmount: () => { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

describe('destination pin animation lifecycle', () => {
  it('rests while the expanded sheet covers the map, and turns again once it is uncovered', () => {
    const covered = harness(); covered.render(false, true);
    expect(covered.values[0].current).toBe(0);
    const uncovered = harness(); uncovered.render(false, false);
    expect(uncovered.values[0].current).toMatchObject({ kind: 'repeat' });
  });

  it('turns the whole pin continuously through 360 degrees at constant speed', () => {
    const h = harness(); const style = h.render();
    expect(style.transform).toEqual([{ perspective: 500 }, { rotateY: '0deg' }]);
    expect(h.values[0].current).toEqual({ kind: 'repeat', args: [
      { kind: 'timing', args: [360, { duration: 3200, easing: 'linear', reduceMotion: 'never' }] },
      -1, false, undefined, 'never',
    ] });
  });

  it.each(['reduced', 'blurred', 'background', 'stale'])('settles facing forward while %s, then resumes when eligible', mode => {
    const h = harness(); h.render();
    if (mode === 'reduced') h.reduce(true);
    if (mode === 'blurred') h.focus(false);
    if (mode === 'background') h.appState('background');
    h.render(mode === 'stale');
    expect(h.values.map(value => value.current)).toEqual([0]);
    h.reduce(false); h.focus(true); h.appState('active'); h.render();
    expect(h.values[0].current.kind).toBe('repeat');
  });

  it('cancels rotation and removes its app-state subscription on unmount', () => {
    const h = harness(); h.render(); h.cancel.mockClear();
    expect(h.listeners.size).toBe(1);
    h.unmount();
    expect(h.cancel.mock.calls.map(([value]) => value)).toEqual(h.values);
    expect(h.values.map(value => value.current)).toEqual([0]);
    expect(h.listeners.size).toBe(0);
  });
});
