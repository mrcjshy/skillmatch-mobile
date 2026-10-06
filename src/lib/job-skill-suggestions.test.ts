import { describe, expect, it, vi } from 'vitest';
import { buildJobSkillSuggestionsRequest, parseJobSkillSuggestionsResponse, jobSkillSuggestionLabels,
  createJobSkillSuggestionsInvoker, JobSkillSuggestionsError, createJobSkillSuggestionsRunner,
  type SuggestionOwnerToken, type JobSkillSuggestionsState } from './job-skill-suggestions';

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const catalog = [{ id: U1, skill_name: 'Plumbing' }, { id: U2, skill_name: 'Electrical' }];
const response = {
  mode: 'job_skill_suggestions' as const,
  suggestions: [{ skill_id: U1, explanation: 'Fixing a leaking tap uses plumbing.', confidence: 0.8 }],
  source: 'gemini' as const,
};

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(invoke = vi.fn().mockResolvedValue(response)) {
  const owner: SuggestionOwnerToken = {
    ownerIdentity: {}, ownerId: 'owner-A', draftEpoch: 1, sessionLifetime: {},
    sessionRevision: 1, inputRevision: 1, manualRevision: 1, catalogRevision: 1,
  };
  let current = { ...owner };
  let currentCatalog = catalog;
  let active = true;
  const states: JobSkillSuggestionsState[] = [];
  const runner = createJobSkillSuggestionsRunner({
    invoke, getCatalog: () => currentCatalog,
    isCurrent: (token) => active && Object.entries(token).every(([key, value]) => current[key as keyof SuggestionOwnerToken] === value),
    publish: (state) => states.push(state),
  });
  return {
    owner, runner, invoke, states,
    change(patch: Partial<SuggestionOwnerToken>) { current = { ...current, ...patch }; },
    current: () => current,
    setCatalog(skills: typeof catalog) { currentCatalog = skills; },
    deactivate() { active = false; },
    activate() { active = true; },
  };
}

describe('description-only classification request', () => {
  it.each([
    'Fix a leaking tap',
    'May tumutulong gripo na kailangang ayusin',
    'Leaking ang gripo, need repair',
  ])('sends only the explicit description for %s', (description) => {
    expect(buildJobSkillSuggestionsRequest(description)).toEqual({
      mode: 'job_skill_suggestions', description,
    });
  });
  it.each(['', ' \n\t ', 'a'.repeat(2001), '😀'.repeat(2001), null, 4, { description: 'Repair' }])(
    'rejects invalid description %#', (description) => {
      expect(buildJobSkillSuggestionsRequest(description)).toBeNull();
    }
  );

  it('accepts exactly 2000 codepoints / 8000 UTF8 bytes', () => {
    const description = '😀'.repeat(2000);
    expect(buildJobSkillSuggestionsRequest(description)).toEqual({ mode: 'job_skill_suggestions', description });
  });

  it.each([{}, null, 'file://photo.jpg', { mime_type: 'image/jpeg', data: 'AAAA' }])(
    'rejects unsupported or unprepared explicitly selected image %#', (image) => {
      expect(buildJobSkillSuggestionsRequest('Repair the tap', image)).toBeNull();
    }
  );

  it('never accepts an entire draft/account/location object', () => {
    expect(buildJobSkillSuggestionsRequest({
      description: 'Repair', ownerId: 'private', email: 'private', phone: 'private',
      address: 'private', latitude: 1, longitude: 2, job_id: 'private', booking_id: 'private',
      payment: 'private', rating: 3, photo: 'file://private', name: 'private', original: 'private',
    })).toBeNull();
  });
});

describe('optional normalized PNG classification request', () => {
  const image = { mime_type: 'image/png' as const,
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==' };

  it('builds exactly description plus one normalized PNG object', () => {
    expect(buildJobSkillSuggestionsRequest('Repair a tap', image)).toEqual({
      mode: 'job_skill_suggestions', description: 'Repair a tap', image,
    });
  });

  it('sends one image through the existing authenticated function adapter', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: response, error: null });
    const request = { mode: 'job_skill_suggestions' as const, description: 'Repair', image };
    expect(await createJobSkillSuggestionsInvoker({ invoke })(request)).toEqual(response);
    expect(invoke.mock.calls).toEqual([['skillmatch-ai', { body: request }]]);
  });

  it('runs image classification once and retains all owner freshness checks', async () => {
    const pending = deferred();
    const h = harness(vi.fn().mockReturnValue(pending.promise));
    const task = h.runner.request(h.owner, 'Repair', image);
    expect(h.invoke.mock.calls).toEqual([[{ mode: 'job_skill_suggestions', description: 'Repair', image }]]);
    h.change({ inputRevision: 2 });
    pending.resolve(response);
    expect(await task).toBe('invalidated');
    expect(h.runner.apply(h.current())).toBeNull();
  });

  it.each([[], [image], { ...image, uri: 'file://private' }, { ...image, data: 'AAAA' },
    { ...image, mime_type: 'image/jpeg' }].map((input) => ({ input })))('rejects arrays/original/malformed image input %#', ({ input }) => {
    expect(buildJobSkillSuggestionsRequest('Repair', input)).toBeNull();
  });
});

describe('deliberate classification runner', () => {
  it('does not invoke on creation, snapshot or reset', () => {
    const h = harness();
    expect(h.runner.snapshot()).toEqual({ status: 'idle' });
    h.runner.reset();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('allows one explicit request and ignores concurrent busy presses', async () => {
    const pending = deferred();
    const h = harness(vi.fn().mockReturnValue(pending.promise));
    const first = h.runner.request(h.owner, 'Repair');
    expect(h.runner.snapshot()).toEqual({ status: 'loading' });
    expect(await h.runner.request(h.owner, 'Repair')).toBe('ignored');
    expect(h.invoke.mock.calls).toEqual([[{ mode: 'job_skill_suggestions', description: 'Repair' }]]);
    pending.resolve(response);
    expect(await first).toBe('completed');
    expect(h.runner.snapshot()).toEqual({ status: 'ready', response });
  });

  it('stores empty abstention distinctly and never applies it', async () => {
    const h = harness(vi.fn().mockResolvedValue({ ...response, suggestions: [] }));
    expect(await h.runner.request(h.owner, 'Repair')).toBe('completed');
    expect(h.runner.snapshot()).toEqual({ status: 'empty' });
    expect(h.runner.apply(h.owner)).toBeNull();
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it.each(['rate_limited', 'authorization', 'service_error'] as const)(
    'shows recoverable sanitized %s with no automatic retry', async (kind) => {
      const h = harness(vi.fn().mockRejectedValue(new JobSkillSuggestionsError(kind)));
      await h.runner.request(h.owner, 'Repair');
      expect(h.runner.snapshot()).toEqual({ status: 'error', kind });
      expect(h.invoke).toHaveBeenCalledTimes(1);
      await h.runner.request(h.owner, 'Repair');
      expect(h.invoke).toHaveBeenCalledTimes(2);
    }
  );

  it('maps arbitrary rejected errors to a safe service state', async () => {
    const h = harness(vi.fn().mockRejectedValue(new Error('PRIVATE')));
    await h.runner.request(h.owner, 'Repair');
    expect(h.runner.snapshot()).toEqual({ status: 'error', kind: 'service_error' });
    expect(JSON.stringify(h.states)).not.toContain('PRIVATE');
  });

  it('rejects malformed results as recoverable service failure', async () => {
    const h = harness(vi.fn().mockResolvedValue({ ...response, extra: true }));
    await h.runner.request(h.owner, 'Repair');
    expect(h.runner.snapshot()).toEqual({ status: 'error', kind: 'service_error' });
  });

  it.each([[''], ['x'.repeat(2001)], ['Repair', { uri: 'file://photo' }]])(
    'makes no call for invalid or held input %#', async (description, image?: { uri: string }) => {
      const h = harness();
      expect(await h.runner.request(h.owner, description, image)).toBe('invalid_input');
      expect(h.invoke).not.toHaveBeenCalled();
    }
  );
});

describe('request ownership and draft freshness', () => {
  it.each([
    { ownerId: 'owner-B' }, { ownerIdentity: {} }, { draftEpoch: 2 }, { sessionLifetime: {} },
    { sessionRevision: 2 }, { inputRevision: 2 }, { manualRevision: 2 }, { catalogRevision: 2 },
  ])('invalidates pending results when ownership/revision changes %#', async (patch) => {
    const pending = deferred();
    const h = harness(vi.fn().mockReturnValue(pending.promise));
    const task = h.runner.request(h.owner, 'Repair');
    h.change(patch);
    expect(h.runner.snapshot()).toEqual({ status: 'idle' });
    pending.resolve(response);
    expect(await task).toBe('invalidated');
    expect(h.states).toEqual([{ status: 'loading' }]);
  });

  it.each(['inputRevision', 'manualRevision'] as const)(
    'invalidates changes-away/back through monotonic %s', async (revision) => {
      const pending = deferred();
      const h = harness(vi.fn().mockReturnValue(pending.promise));
      const task = h.runner.request(h.owner, 'Repair');
      h.change({ [revision]: 2 });
      h.change({ [revision]: 3 });
      pending.resolve(response);
      expect(await task).toBe('invalidated');
      expect(h.runner.apply(h.current())).toBeNull();
    }
  );

  it.each(['focus/background authority lost', 'dispose/unmount', 'explicit reset'])(
    'rejects pending completion after %s', async (event) => {
      const pending = deferred();
      const h = harness(vi.fn().mockReturnValue(pending.promise));
      const task = h.runner.request(h.owner, 'Repair');
      if (event === 'focus/background authority lost') h.deactivate();
      if (event === 'dispose/unmount') h.runner.dispose();
      if (event === 'explicit reset') h.runner.reset();
      pending.resolve(response);
      expect(await task).toBe('invalidated');
      expect(h.runner.snapshot()).toEqual({ status: 'idle' });
      expect(h.states.some((state) => state.status === 'ready')).toBe(false);
    }
  );

  it('does not publish stale failures into a new owner', async () => {
    const pending = deferred();
    const h = harness(vi.fn().mockReturnValue(pending.promise));
    const task = h.runner.request(h.owner, 'Repair');
    h.change({ ownerId: 'owner-B' });
    pending.reject(new JobSkillSuggestionsError('authorization'));
    expect(await task).toBe('invalidated');
    expect(h.states).toEqual([{ status: 'loading' }]);
  });

  it('a stale success finalizer cannot release or replace a successor request', async () => {
    const old = deferred();
    const next = deferred();
    const invoke = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const h = harness(invoke);
    const first = h.runner.request(h.owner, 'Repair');
    h.runner.reset();
    h.change({ inputRevision: 2 });
    const second = h.runner.request(h.current(), 'Electrical repair');
    old.resolve(response);
    expect(await first).toBe('invalidated');
    expect(h.runner.snapshot()).toEqual({ status: 'loading' });
    expect(await h.runner.request(h.current(), 'Double press')).toBe('ignored');
    next.resolve(response);
    expect(await second).toBe('completed');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('a stale error finalizer cannot release a successor request', async () => {
    const old = deferred();
    const next = deferred();
    const h = harness(vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise));
    const first = h.runner.request(h.owner, 'Repair');
    h.runner.reset();
    const second = h.runner.request(h.owner, 'Repair');
    old.reject(new Error('PRIVATE'));
    expect(await first).toBe('invalidated');
    expect(h.runner.snapshot()).toEqual({ status: 'loading' });
    expect(await h.runner.request(h.owner, 'Double press')).toBe('ignored');
    next.resolve(response);
    await second;
  });

  it('ignores requests from expired owners or a disposed runner', async () => {
    const h = harness();
    h.deactivate();
    expect(await h.runner.request(h.owner, 'Repair')).toBe('invalidated');
    h.activate();
    h.runner.dispose();
    expect(await h.runner.request(h.owner, 'Repair')).toBe('invalidated');
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('captures a token copy so external token mutation cannot restore old authority', async () => {
    const pending = deferred();
    const h = harness(vi.fn().mockReturnValue(pending.promise));
    const task = h.runner.request(h.owner, 'Repair');
    h.owner.inputRevision = 2;
    h.change({ inputRevision: 2 });
    pending.resolve(response);
    expect(await task).toBe('invalidated');
  });
});

describe('explicit freshness-checked Apply', () => {
  const two = { ...response, suggestions: [
    { skill_id: U1, explanation: 'Plumbing repair' },
    { skill_id: U2, explanation: 'Electrical repair' },
  ] };

  it('returns at most two ordered IDs once without writing or submitting a Job', async () => {
    const h = harness(vi.fn().mockResolvedValue(two));
    await h.runner.request(h.owner, 'Repair');
    expect(h.runner.apply(h.owner)).toEqual([U1, U2]);
    expect(h.runner.apply(h.owner)).toBeNull();
    expect(h.runner.snapshot()).toEqual({ status: 'idle' });
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('permits an explicit ordered subset or reordering of suggested IDs', async () => {
    const h = harness(vi.fn().mockResolvedValue(two));
    await h.runner.request(h.owner, 'Repair');
    expect(h.runner.apply(h.owner, [U2, U1])).toEqual([U2, U1]);
    await h.runner.request(h.owner, 'Repair');
    expect(h.runner.apply(h.owner, [U2])).toEqual([U2]);
  });

  it.each([[], [U1, U1], [U1, U2, U1], ['00000000-0000-4000-8000-000000000003']].map((ids) => ({ ids })))(
    'rejects invalid explicit selection without consuming a fresh result %#', async ({ ids }) => {
      const h = harness(vi.fn().mockResolvedValue(two));
      await h.runner.request(h.owner, 'Repair');
      expect(h.runner.apply(h.owner, ids)).toBeNull();
      expect(h.runner.apply(h.owner, [U1])).toEqual([U1]);
    }
  );

  it('revalidates against the current authoritative catalog at Apply', async () => {
    const h = harness();
    await h.runner.request(h.owner, 'Repair');
    h.setCatalog([catalog[1]]);
    expect(h.runner.apply(h.owner)).toBeNull();
  });

  it('manual picker activity invalidates already displayed suggestions', async () => {
    const h = harness();
    await h.runner.request(h.owner, 'Repair');
    h.change({ manualRevision: 2 });
    expect(h.runner.snapshot()).toEqual({ status: 'idle' });
    expect(h.runner.apply(h.current())).toBeNull();
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('catalog name changes are reflected locally without sending model names', async () => {
    const h = harness();
    await h.runner.request(h.owner, 'Repair');
    h.setCatalog([{ id: U1, skill_name: 'Current plumbing' }, catalog[1]]);
    const state = h.runner.snapshot();
    expect(state.status === 'ready' && jobSkillSuggestionLabels(state.response, [{ id: U1, skill_name: 'Current plumbing' }]))
      .toEqual([{ ...response.suggestions[0], skill_name: 'Current plumbing' }]);
    expect(h.runner.apply(h.owner)).toEqual([U1]);
  });

  it('caller mutation of a snapshot or published response cannot alter Apply authority', async () => {
    const h = harness();
    await h.runner.request(h.owner, 'Repair');
    const state = h.runner.snapshot();
    if (state.status === 'ready') state.response.suggestions[0].skill_id = U2;
    const published = h.states.find((value) => value.status === 'ready');
    if (published?.status === 'ready') published.response.suggestions.push({ skill_id: U2, explanation: 'Injected' });
    expect(h.runner.apply(h.owner)).toEqual([U1]);
  });

  it('does not accept a fresh different token as authority for an old response', async () => {
    const h = harness();
    await h.runner.request(h.owner, 'Repair');
    h.change({ draftEpoch: 2 });
    expect(h.runner.apply(h.current())).toBeNull();
  });
});

describe('transport request rejection', () => {
  it('rejects extra private fields before the existing client is invoked', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: response, error: null });
    await expect(createJobSkillSuggestionsInvoker({ invoke })({
      mode: 'job_skill_suggestions', description: 'Repair', address: 'private',
    } as never)).rejects.toMatchObject({ kind: 'service_error' });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('unresolvable callback authority fails closed', () => {
  it('treats a throwing current-lifetime guard as invalidation before dispatch', async () => {
    const h = harness();
    const invoke = vi.fn();
    const runner = createJobSkillSuggestionsRunner({
      invoke, getCatalog: () => catalog, isCurrent: () => { throw new Error('PRIVATE'); },
    });
    expect(await runner.request(h.owner, 'Repair')).toBe('invalidated');
    expect(runner.snapshot()).toEqual({ status: 'idle' });
    expect(runner.apply(h.owner)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('masks result, Apply and finalizer when guard begins throwing', async () => {
    const pending = deferred();
    const h = harness();
    let broken = false;
    const states: JobSkillSuggestionsState[] = [];
    const runner = createJobSkillSuggestionsRunner({
      invoke: () => pending.promise, getCatalog: () => catalog,
      isCurrent: () => { if (broken) throw new Error('PRIVATE'); return true; },
      publish: (state) => states.push(state),
    });
    const task = runner.request(h.owner, 'Repair');
    broken = true;
    expect(runner.snapshot()).toEqual({ status: 'idle' });
    pending.resolve(response);
    expect(await task).toBe('invalidated');
    expect(runner.apply(h.owner)).toBeNull();
    expect(states).toEqual([{ status: 'loading' }]);
  });

  it('treats a throwing catalog callback as invalidation without an error flash', async () => {
    const h = harness();
    const runner = createJobSkillSuggestionsRunner({
      invoke: async () => response, isCurrent: () => true,
      getCatalog: () => { throw new Error('PRIVATE'); },
    });
    expect(await runner.request(h.owner, 'Repair')).toBe('invalidated');
    expect(runner.snapshot()).toEqual({ status: 'idle' });
  });

  it('fails closed at Apply if current catalog can no longer be read', async () => {
    const h = harness();
    let broken = false;
    const runner = createJobSkillSuggestionsRunner({
      invoke: async () => response, isCurrent: () => true,
      getCatalog: () => { if (broken) throw new Error('PRIVATE'); return catalog; },
    });
    await runner.request(h.owner, 'Repair');
    broken = true;
    expect(runner.apply(h.owner)).toBeNull();
    expect(runner.snapshot()).toEqual({ status: 'idle' });
  });

  it('a throwing UI publisher cannot dispatch, leave busy or leak a rejected promise', async () => {
    const h = harness();
    const invoke = vi.fn().mockResolvedValue(response);
    const runner = createJobSkillSuggestionsRunner({
      invoke, isCurrent: () => true, getCatalog: () => catalog,
      publish: () => { throw new Error('PRIVATE'); },
    });
    expect(await runner.request(h.owner, 'Repair')).toBe('invalidated');
    expect(runner.snapshot()).toEqual({ status: 'idle' });
    expect(() => runner.reset()).not.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('authenticated Supabase invocation seam', () => {
  const request = { mode: 'job_skill_suggestions' as const, description: 'Repair a tap' };

  it('uses one existing-client function invocation with the exact minimal body', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: response, error: null });
    expect(await createJobSkillSuggestionsInvoker({ invoke })(request)).toEqual(response);
    expect(invoke.mock.calls).toEqual([['skillmatch-ai', { body: request }]]);
  });

  it.each([
    [429, 'rate_limited'], [401, 'authorization'], [403, 'authorization'], [502, 'service_error'],
  ])('maps HTTP %i to sanitized %s without retry', async (status, kind) => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: {
      message: 'PRIVATE_PROVIDER_TOKEN', context: new Response('PRIVATE_PROVIDER_TOKEN', { status }),
    } });
    const error = await createJobSkillSuggestionsInvoker({ invoke })(request).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(JobSkillSuggestionsError);
    expect(error).toMatchObject({ kind });
    expect(String(error)).not.toContain('PRIVATE_PROVIDER_TOKEN');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('recognizes ai_limit_reached from a bounded FunctionsHttpError body', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: {
      context: new Response('{"error":"ai_limit_reached"}', { status: 503 }),
    } });
    await expect(createJobSkillSuggestionsInvoker({ invoke })(request)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('recognizes safe ai_limit_reached data without accepting provider prose', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { error: 'ai_limit_reached' }, error: null });
    await expect(createJobSkillSuggestionsInvoker({ invoke })(request)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('bounds unknown-length error streams and cancels oversized input', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(1025))); }, cancel,
    });
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { context: new Response(body, { status: 503 }) } });
    await expect(createJobSkillSuggestionsInvoker({ invoke })(request)).rejects.toMatchObject({ kind: 'service_error' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('sanitizes rejected transports and makes no silent retry', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('PRIVATE_PROVIDER_TOKEN'));
    const error = await createJobSkillSuggestionsInvoker({ invoke })(request).catch((value: unknown) => value);
    expect(error).toMatchObject({ kind: 'service_error' });
    expect(String(error)).not.toContain('PRIVATE_PROVIDER_TOKEN');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe('strict current-catalog classification response', () => {
  it('accepts ordered existing UUID IDs and uses current catalog labels', () => {
    const value = { ...response, suggestions: [
      { skill_id: U2, explanation: 'Electrical repair', confidence: 0 },
      { skill_id: U1, explanation: 'Plumbing repair', confidence: 1 },
    ] };
    const parsed = parseJobSkillSuggestionsResponse(value, catalog);
    expect(parsed).toEqual(value);
    expect(jobSkillSuggestionLabels(parsed!, [{ id: U2, skill_name: 'Current electrical label' }, catalog[0]])).toEqual([
      { skill_id: U2, skill_name: 'Current electrical label', explanation: 'Electrical repair', confidence: 0 },
      { skill_id: U1, skill_name: 'Plumbing', explanation: 'Plumbing repair', confidence: 1 },
    ]);
  });

  it('accepts empty suggestions as an abstention', () => {
    expect(parseJobSkillSuggestionsResponse({ ...response, suggestions: [] }, catalog)).toEqual({
      mode: 'job_skill_suggestions', suggestions: [], source: 'gemini',
    });
  });

  it.each([
    null, [], { ...response, source: 'other' }, { ...response, mode: 'skill_gap_guidance' },
    { ...response, extra: true }, { ...response, suggestions: 'Plumbing' },
    { ...response, suggestions: [{ skill_id: '00000000-0000-4000-8000-000000000003', explanation: 'Unknown' }] },
    { ...response, suggestions: [{ skill_id: 'Plumbing', explanation: 'Named' }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: '   ' }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: 'x'.repeat(161) }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: '😀'.repeat(161) }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: 'Repair', confidence: NaN }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: 'Repair', confidence: Infinity }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: 'Repair', confidence: -0.1 }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: 'Repair', confidence: 1.1 }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: 'Repair', confidence: '0.8' }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: 'Repair', skill_name: 'Model label' }] },
    { ...response, suggestions: [{ skill_id: U1, explanation: 'Repair' }, { skill_id: U1, explanation: 'Again' }] },
    { ...response, suggestions: [response.suggestions[0], { skill_id: U2, explanation: 'Second' }, response.suggestions[0]] },
    { ...response, suggestions: [{ skill_id: U1 }] },
  ])('rejects malformed/unknown/duplicate/excess result %#', (value) => {
    expect(parseJobSkillSuggestionsResponse(value, catalog)).toBeNull();
  });

  it('accepts optional confidence and exactly 160 Unicode codepoints', () => {
    const value = { ...response, suggestions: [{ skill_id: U1, explanation: '😀'.repeat(160) }] };
    expect(parseJobSkillSuggestionsResponse(value, catalog)).toEqual(value);
  });

  it('rejects a non-UUID even if a damaged catalog contains it', () => {
    expect(parseJobSkillSuggestionsResponse({ ...response, suggestions: [{ skill_id: 'fake', explanation: 'Repair' }] }, [
      { id: 'fake', skill_name: 'Fake' },
    ])).toBeNull();
  });

  it('revalidates catalog membership before presenting names', () => {
    expect(jobSkillSuggestionLabels(response, [])).toBeNull();
  });
});
