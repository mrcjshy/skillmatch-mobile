// @ts-expect-error -- Node built-ins are available to Vitest, outside Expo's app types.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node built-ins are available to Vitest, outside Expo's app types.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Execute the real hook with controlled platform/effect boundaries. This checks
// its returned-value contract, not browser DOM hydration or React scheduling.
function mount(systemScheme: 'light' | 'dark') {
  let scheme = systemScheme;
  let state: boolean | undefined;
  let effect: (() => void) | undefined;
  const exports: { useColorScheme?: () => string } = {};
  const modules: Record<string, unknown> = {
    react: {
      useState: (initial: boolean) => {
        if (state === undefined) state = initial;
        return [state, (next: boolean) => { state = next; }];
      },
      useEffect: (callback: () => void) => { effect = callback; },
    },
    'react-native': { useColorScheme: () => scheme },
  };
  const compiled = ts.transpileModule(readFileSync('src/hooks/use-color-scheme.web.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    },
  });
  const readScheme = exports.useColorScheme!;
  return {
    read: () => readScheme(),
    hydrate: () => { effect?.(); },
    setSystemScheme: (next: 'light' | 'dark') => { scheme = next; },
  };
}

describe('web color scheme hydration contract', () => {
  it('returns light before hydration even when the system is dark', () => {
    const hook = mount('dark');
    expect(hook.read()).toBe('light');
  });

  it('keeps light after hydration on a light system', () => {
    const hook = mount('light');
    expect(hook.read()).toBe('light');
    hook.hydrate();
    expect(hook.read()).toBe('light');
  });

  it('transitions from light to dark when the hydration effect commits', () => {
    const hook = mount('dark');
    expect(hook.read()).toBe('light');
    hook.hydrate();
    expect(hook.read()).toBe('dark');
  });

  it('observes later system changes after hydration', () => {
    const hook = mount('dark');
    hook.read();
    hook.hydrate();
    expect(hook.read()).toBe('dark');
    hook.setSystemScheme('light');
    expect(hook.read()).toBe('light');
    hook.setSystemScheme('dark');
    expect(hook.read()).toBe('dark');
  });
});
