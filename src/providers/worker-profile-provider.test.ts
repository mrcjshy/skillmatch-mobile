// @ts-expect-error -- Node built-ins are available to Vitest, outside Expo's app types.
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node built-ins are available to Vitest, outside Expo's app types.
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as workerProfile from '../lib/worker-profile';
import type { useWorkerProfile } from './worker-profile-provider';

type ProfileState = ReturnType<typeof useWorkerProfile>;
type ProfileRow = { id: string; bio: string; availability_status: string; is_verified: boolean };
type ProfileResult = { data: ProfileRow | null; error: { code: string; message: string } | null };

function pendingProfile() {
  let resolve!: (value: ProfileResult) => void;
  const promise = new Promise<ProfileResult>((done) => { resolve = done; });
  return { promise, resolve };
}

const profile = (bio: string): ProfileResult => ({
  data: { id: bio, bio, availability_status: 'available', is_verified: true },
  error: null,
});

// Run the actual provider and helper code at the public context seam. Only
// account input, database I/O and React host/effect timing are controlled here.
// This is not a React renderer: it proves effect-body behavior after cleanup,
// not React scheduling, request abortion, or races in save/availability methods.
function mount(requests: Record<string, ReturnType<typeof pendingProfile>>, initialUser = 'A') {
  let userId: string | undefined = initialUser;
  const slots: unknown[] = [];
  let cursor = 0;
  let value: ProfileState;
  let cleanup: (() => void) | undefined;
  let nextEffect: (() => (() => void) | undefined) | undefined;
  let stopped = false;
  const writesAfterUnmount: unknown[] = [];
  const requestedUsers: string[] = [];
  const modules: Record<string, unknown> = {
    react: {
      createContext: () => ({ Provider: 'WorkerProfileContext' }),
      useContext: () => value,
      useState(initial: unknown) {
        const slot = cursor++;
        if (!(slot in slots)) slots[slot] = initial;
        return [slots[slot], (next: unknown) => {
          if (stopped) writesAfterUnmount.push(next);
          slots[slot] = typeof next === 'function' ? next(slots[slot]) : next;
        }];
      },
      useCallback(callback: unknown, deps: unknown[]) {
        const slot = cursor++;
        const previous = slots[slot] as { callback: unknown; deps: unknown[] } | undefined;
        if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
          slots[slot] = { callback, deps };
        }
        return (slots[slot] as { callback: unknown }).callback;
      },
      useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
        const slot = cursor++;
        const previous = slots[slot] as unknown[] | undefined;
        if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
          slots[slot] = deps;
          nextEffect = effect;
        }
      },
    },
    'react/jsx-runtime': { jsx: (_type: unknown, props: { value: ProfileState }) => props },
    '@/providers/account-provider': { useAccount: () => ({ account: userId ? { id: userId } : null }) },
    '@/lib/worker-profile': workerProfile,
    '@/lib/supabase': {
      supabase: {
        from(table: string) {
          if (table === 'skills') return { select: () => ({ order: async () => ({ data: [{ id: 'plumbing', skill_name: 'Plumbing' }], error: null }) }) };
          if (table === 'worker_profiles') return {
            select: () => ({ eq: (_column: string, id: string) => ({ maybeSingle: () => {
              if (!requests[id]) throw new Error(`Unexpected user: ${id}`);
              requestedUsers.push(id);
              return requests[id].promise;
            } }) }),
          };
          if (table === 'worker_skills') return { select: () => ({ eq: async () => ({ data: [{ skill_id: 'plumbing', proficiency_level: 'expert' }], error: null }) }) };
          throw new Error(`Unexpected table: ${table}`);
        },
      },
    },
  };
  const exports = {} as {
    WorkerProfileProvider: (props: { children: null }) => { value: ProfileState };
    useWorkerProfile: typeof useWorkerProfile;
  };
  const compiled = ts.transpileModule(readFileSync('src/providers/worker-profile-provider.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    console: { warn: () => {} },
    require: (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    },
  });
  const readProfile = exports.useWorkerProfile;
  const read = () => {
    cursor = 0;
    value = exports.WorkerProfileProvider({ children: null }).value;
    return readProfile();
  };
  const commit = () => {
    read();
    if (nextEffect) {
      cleanup?.();
      const effect = nextEffect;
      nextEffect = undefined;
      cleanup = effect();
    }
    return read();
  };
  commit();
  return {
    read,
    requestedUsers,
    writesAfterUnmount,
    setUser: (next: string | undefined) => { userId = next; return commit(); },
    unmount: () => { cleanup?.(); stopped = true; },
    settle: async () => { await new Promise((done) => setTimeout(done, 0)); },
  };
}

describe('Worker profile effect lifecycle contract', () => {
  it('loads the current user and exposes loading then the successful profile', async () => {
    const request = pendingProfile();
    const provider = mount({ A: request });
    expect(provider.read().isLoading).toBe(true);
    expect(provider.read().loadError).toBeNull();
    await provider.settle();
    expect(provider.requestedUsers).toEqual(['A']);
    request.resolve(profile('Worker A'));
    await provider.settle();
    expect(provider.read()).toMatchObject({
      isLoading: false, loadError: null, bio: 'Worker A', isVerified: true,
      skills: [{ id: 'plumbing', skill_name: 'Plumbing' }],
      selection: { plumbing: 'expert' }, persistedSelection: { plumbing: 'expert' },
    });
  });

  it('exposes a load failure and clears it when the next user starts loading', async () => {
    const a = pendingProfile();
    const b = pendingProfile();
    const provider = mount({ A: a, B: b });
    a.resolve({ data: null, error: { code: 'test', message: 'failed' } });
    await provider.settle();
    expect(provider.read()).toMatchObject({ isLoading: false, loadError: "Couldn't load your profile. Please try again." });
    expect(provider.setUser('B')).toMatchObject({ isLoading: true, loadError: null });
    await provider.settle();
    expect(provider.requestedUsers).toEqual(['A', 'B']);
    b.resolve(profile('Worker B'));
    await provider.settle();
    expect(provider.read()).toMatchObject({ isLoading: false, loadError: null, bio: 'Worker B' });
  });

  it('keeps existing profile values while the new user is loading', async () => {
    const a = pendingProfile();
    const b = pendingProfile();
    const provider = mount({ A: a, B: b });
    a.resolve(profile('Worker A'));
    await provider.settle();
    expect(provider.setUser('B')).toMatchObject({ isLoading: true, bio: 'Worker A' });
    b.resolve(profile('Worker B'));
    await provider.settle();
    expect(provider.read()).toMatchObject({ isLoading: false, bio: 'Worker B' });
  });

  it('does not let old completion clear the newer pending load', async () => {
    const a = pendingProfile();
    const b = pendingProfile();
    const provider = mount({ A: a, B: b });
    await provider.settle();
    provider.setUser('B');
    a.resolve(profile('Old A'));
    await provider.settle();
    expect(provider.read()).toMatchObject({ isLoading: true, bio: '', loadError: null });
    b.resolve(profile('Current B'));
    await provider.settle();
    expect(provider.read()).toMatchObject({ isLoading: false, bio: 'Current B' });
  });

  it.each(['success', 'failure'] as const)('ignores old %s after the newer user has loaded', async (outcome) => {
    const a = pendingProfile();
    const b = pendingProfile();
    const provider = mount({ A: a, B: b });
    await provider.settle();
    provider.setUser('B');
    b.resolve(profile('Current B'));
    await provider.settle();
    a.resolve(outcome === 'success' ? profile('Old A') : { data: null, error: { code: 'test', message: 'old failure' } });
    await provider.settle();
    expect(provider.read()).toMatchObject({ isLoading: false, loadError: null, bio: 'Current B' });
  });

  it.each(['success', 'failure'] as const)('does not update state for %s after unmount cleanup', async (outcome) => {
    const a = pendingProfile();
    const provider = mount({ A: a });
    await provider.settle();
    provider.unmount();
    a.resolve(outcome === 'success' ? profile('Old A') : { data: null, error: { code: 'test', message: 'old failure' } });
    await provider.settle();
    expect(provider.writesAfterUnmount).toEqual([]);
  });

  it('cancels the pending effect when the user becomes absent without inventing a reset', async () => {
    const a = pendingProfile();
    const provider = mount({ A: a });
    await provider.settle();
    provider.setUser(undefined);
    a.resolve(profile('Old A'));
    await provider.settle();
    expect(provider.requestedUsers).toEqual(['A']);
    expect(provider.read()).toMatchObject({ isLoading: true, bio: '', loadError: null });
  });
});
