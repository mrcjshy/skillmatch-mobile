import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountRecord } from '@/providers/account-provider';

import { CATEGORY_LABEL, FAQ_ENTRIES, QUICK_TOPICS, entriesForCategories, resolveFaq, searchFaq, suggestedEntries } from './faq';
import { buildResumeHtml, loadResume, type ResumeModel } from './resume';
import { computeSkillGap, loadJobRequiredSkills, loadMyOpportunities, loadMyWorkerSkills } from './skill-gap';
import { buildSkillGapGuidanceRequest, createGuidanceRunner, guidanceOwnerKey, loadSkillGapGuidance, parseSkillGapGuidanceResponse, type GuidanceState } from './skill-gap-guidance';

const database = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { ...database, functions: { invoke: database.invoke } } }));
vi.mock('react-native', () => ({ Platform: { select: (values: Record<string, unknown>) => values.android ?? values.default } }));

// Synthetic accounts and rows only. The Vitest setup rejects all network access.
const account = {
  id: 'synthetic-worker', full_name: 'Synthetic Worker', email: 'worker@example.invalid',
  phone: '', barangay: 'Test Area', city: 'Test City', role: 'worker', is_active: true,
} as AccountRecord;

type Result = { data: unknown; error: null | { code: string } };
function rows(responses: Record<string, Result>) {
  const calls: { table: string; filters: unknown[][] }[] = [];
  database.from.mockImplementation((table: string) => {
    if (!(table in responses)) throw new Error(`Unexpected table: ${table}`);
    const entry = { table, filters: [] as unknown[][] }; calls.push(entry);
    const query = {
      select: vi.fn(() => query), order: vi.fn(() => query),
      eq: vi.fn((...args: unknown[]) => { entry.filters.push(args); return query; }),
      in: vi.fn((...args: unknown[]) => { entry.filters.push(args); return query; }),
      maybeSingle: vi.fn(async () => responses[table]),
      then: (resolve: (value: Result) => unknown) => Promise.resolve(responses[table]).then(resolve),
    };
    return query;
  });
  return calls;
}
const ok = (data: unknown): Result => ({ data, error: null });
beforeEach(() => { vi.clearAllMocks(); });

describe('V8-04 deterministic FAQ', () => {
  it('covers all categories and fixed quick-topic and suggestion entries', () => {
    expect(new Set(FAQ_ENTRIES.map(e => e.id)).size).toBe(FAQ_ENTRIES.length);
    for (const category of Object.keys(CATEGORY_LABEL)) expect(FAQ_ENTRIES.some(e => e.category === category)).toBe(true);
    for (const topic of QUICK_TOPICS) expect(entriesForCategories(topic.categories).length).toBeGreaterThan(0);
    expect(suggestedEntries()).toHaveLength(5);
    expect(suggestedEntries().every(e => FAQ_ENTRIES.includes(e))).toBe(true);
  });
  it.each(FAQ_ENTRIES.map(e => [e.id, e.question] as const))('returns the fixed answer for %s', (id, question) => {
    const answer = resolveFaq(question);
    expect(answer.kind).toBe('answer');
    if (answer.kind === 'answer') expect(answer.entry).toBe(FAQ_ENTRIES.find(e => e.id === id));
    expect(database.from).not.toHaveBeenCalled();
    expect(database.invoke).not.toHaveBeenCalled();
  });
  it.each(['Paano mag-register sa SkillMatch?', 'Paano gumagana ang job matching?', 'cash payment', 'verified worker'])('keeps Tagalog/Taglish results inside the knowledge base: %s', query => {
    const first = searchFaq(query);
    expect(first.length).toBeGreaterThan(0);
    expect(searchFaq(query)).toEqual(first);
    expect(first.every(hit => FAQ_ENTRIES.includes(hit.entry))).toBe(true);
  });
  it('uses empty and unsupported states without private lookups', () => {
    expect(resolveFaq('   ').kind).toBe('empty');
    expect(resolveFaq('quantum zebracorn astronomy').kind).toBe('none');
    expect(database.from).not.toHaveBeenCalled();
    expect(database.rpc).not.toHaveBeenCalled();
    expect(database.invoke).not.toHaveBeenCalled();
  });
  it('bounds very long input and handles ambiguous payments as fixed choices', () => {
    expect(searchFaq('x'.repeat(300) + ' cash')).toEqual(searchFaq('x'.repeat(300)));
    const result = resolveFaq('bayad');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') expect(result.candidates.every(e => FAQ_ENTRIES.includes(e))).toBe(true);
  });
});

describe('V8-04 deterministic resume', () => {
  const source = () => ({
    worker_profiles: ok({ id: 'profile-a', bio: '  Repairs fixtures.  ', is_verified: true, availability_status: 'available', rating_avg: 4.5 }),
    worker_skills: ok([{ skill_id: 'skill-a', proficiency_level: 'expert' }, { skill_id: 'unresolved', proficiency_level: 'expert' }]),
    skills: ok([{ id: 'skill-a', skill_name: 'Plumbing' }]),
    portfolio_items: ok([{ title: 'Synthetic sink repair', description: 'Replaced a washer.', project_scale: 'small' }]),
  });
  it('maps only saved profile, resolved skill and portfolio data under the current owner', async () => {
    const calls = rows(source());
    const model = await loadResume(account);
    expect(model).toEqual({ fullName: account.full_name, email: account.email, phone: '', barangay: 'Test Area', city: 'Test City', summary: 'Repairs fixtures.', isVerified: true, availability: 'available', ratingAvg: 4.5, skills: [{ name: 'Plumbing', proficiency: 'expert' }], projects: [{ title: 'Synthetic sink repair', description: 'Replaced a washer.', scale: 'small' }] });
    expect(calls.find(c => c.table === 'worker_profiles')?.filters).toContainEqual(['user_id', account.id]);
    for (const table of ['worker_skills', 'portfolio_items']) expect(calls.find(c => c.table === table)?.filters).toContainEqual(['worker_id', 'profile-a']);
    expect(database.invoke).not.toHaveBeenCalled();
  });
  it('returns missing profile without inventing one or reading other tables', async () => {
    rows({ worker_profiles: ok(null) });
    expect(await loadResume(account)).toBeNull();
    expect(database.from).toHaveBeenCalledTimes(1);
  });
  it('omits absent optional sections and does not invent qualifications', async () => {
    rows({ worker_profiles: ok({ id: 'profile-a', bio: ' ', rating_avg: 0 }), worker_skills: ok([]), portfolio_items: ok([]) });
    const model = await loadResume(account);
    expect(model).toMatchObject({ summary: null, ratingAvg: null, availability: null, skills: [], projects: [] });
    const html = buildResumeHtml(model!);
    expect(html).not.toMatch(/Professional Summary|Selected Projects|certified|university|years of experience/i);
    expect(html).toContain('New — no ratings yet');
  });
  it.each(['worker_profiles', 'worker_skills', 'portfolio_items', 'skills'])('propagates unavailable %s so the UI can retry', async table => {
    const fixtures: Record<string, Result> = source(); fixtures[table] = { data: null, error: { code: '503' } };
    rows(fixtures);
    await expect(loadResume(account)).rejects.toMatchObject({ name: 'ResumeError', code: '503' });
    rows(source()); expect(await loadResume(account)).not.toBeNull();
  });
  it('escapes synthetic text in every printable section', () => {
    const model: ResumeModel = { fullName: '<script>bad()</script>', email: 'test@example.invalid', phone: '', barangay: 'A&B', city: 'C', summary: '<img src=x>', isVerified: false, availability: null, ratingAvg: null, skills: [{ name: '<b>Skill</b>', proficiency: null }], projects: [{ title: '<i>Project</i>', description: '<script>bad()</script>', scale: null }] };
    const html = buildResumeHtml(model);
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('Verified SkillMatch Worker');
  });
});

describe('V8-04 deterministic skill gap and optional mocked guidance', () => {
  const required = [{ id: 'b', name: 'Plumbing' }, { id: 'a', name: 'Electrical' }];
  it('computes multiple requirements by ID, sorts consistently and never mutates inputs', () => {
    const mine = [{ id: 'b', name: 'Plumbing', proficiency: 'beginner' as const }];
    const original = JSON.stringify([required, mine]);
    const gap = computeSkillGap([...required, required[0], null], mine);
    expect(gap.requiredSkills.map(s => s.id)).toEqual(['a', 'b']);
    expect(gap.matchedSkills.map(s => s.id)).toEqual(['b']);
    expect(gap.missingSkills.map(s => s.id)).toEqual(['a']);
    expect(computeSkillGap([...required].reverse(), mine)).toEqual(gap);
    expect(JSON.stringify([required, mine])).toBe(original);
  });
  it('does not confuse equal labels with equal skills; empty and zero gaps stay exact', () => {
    expect(computeSkillGap(required, [{ id: 'c', name: 'Plumbing', proficiency: 'expert' }]).missingSkills).toHaveLength(2);
    expect(computeSkillGap(required, required.map(s => ({ ...s, proficiency: null }))).missingSkills).toEqual([]);
    expect(computeSkillGap([], []).missingSkills).toEqual([]);
  });
  it('loads the authenticated Worker profile and resolved skills without accepting another identity', async () => {
    const calls = rows({ worker_profiles: ok({ id: 'profile-a' }), worker_skills: ok([{ skill_id: 'a', proficiency_level: 'beginner' }]), skills: ok([{ id: 'a', skill_name: 'Electrical' }]) });
    expect(await loadMyWorkerSkills(account)).toEqual([{ id: 'a', name: 'Electrical', proficiency: 'beginner' }]);
    expect(calls[0].filters).toContainEqual(['user_id', account.id]);
    expect(calls[1].filters).toContainEqual(['worker_id', 'profile-a']);
  });
  it('uses the existing zero-argument opportunity RPC and preserves authorized order', async () => {
    database.rpc.mockResolvedValue(ok([{ job_id: 'b', title: 'Second' }, { job_id: 'a', title: 'First' }, { job_id: 'b', title: 'Duplicate' }, { title: 'Invalid' }]));
    expect((await loadMyOpportunities()).map(o => o.jobId)).toEqual(['b', 'a']);
    expect(database.rpc).toHaveBeenCalledWith('list_my_job_opportunities');
    expect(database.from).not.toHaveBeenCalled();
  });
  it('fails on unresolved required skill names instead of claiming a zero gap', async () => {
    rows({ job_skills: ok([{ skill_id: 'required-a' }]), skills: ok([]) });
    await expect(loadJobRequiredSkills('synthetic-job')).rejects.toThrow('required skill unresolved');
  });
  it('keeps missing-profile and unavailable opportunity states distinct', async () => {
    rows({ worker_profiles: ok(null) }); expect(await loadMyWorkerSkills(account)).toBeNull();
    database.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(loadMyOpportunities()).rejects.toMatchObject({ code: '42501' });
  });
  it('returns zero-gap guidance without any invocation', async () => {
    const invoke = vi.fn();
    expect(await loadSkillGapGuidance('synthetic-job', [], 'No missing skills.', invoke)).toEqual({ guidance: 'No missing skills.', source: 'deterministic' });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('sends only mode and job ID and validates synthetic nonzero guidance', async () => {
    expect(buildSkillGapGuidanceRequest('synthetic-job')).toEqual({ mode: 'skill_gap_guidance', job_id: 'synthetic-job' });
    const invoke = vi.fn().mockResolvedValue({ mode: 'skill_gap_guidance', missing_skills: ['Electrical'], guidance: 'Practice safely with a qualified instructor.', source: 'gemini' });
    expect(await loadSkillGapGuidance('synthetic-job', ['Electrical'], 'Unused', invoke)).toMatchObject({ source: 'gemini' });
    expect(invoke).toHaveBeenCalledWith('synthetic-job');
  });
  it.each([{}, null, { mode: 'skill_gap_guidance', missing_skills: [], guidance: 'Wrong gap', source: 'gemini' }, { mode: 'skill_gap_guidance', missing_skills: ['Electrical'], guidance: 'x'.repeat(1201), source: 'gemini' }, { mode: 'skill_gap_guidance', missing_skills: ['Electrical'], guidance: 'Text', source: 'deterministic' }])('rejects malformed or inconsistent synthetic guidance %#', value => {
    expect(parseSkillGapGuidanceResponse(value, ['Electrical'])).toBeNull();
  });
  it('has loading, error, explicit retry and success states without changing the gap', async () => {
    const states: GuidanceState[] = [];
    const load = vi.fn().mockRejectedValueOnce(new Error('synthetic offline')).mockResolvedValueOnce({ source: 'gemini', guidance: 'Practice.' });
    const runner = createGuidanceRunner({ jobId: 'job', missingSkillNames: ['Electrical'], zeroGapCopy: 'None', load });
    runner.request(s => states.push(s)); await Promise.resolve();
    expect(states).toEqual([{ kind: 'loading' }, { kind: 'error' }]);
    runner.request(s => states.push(s)); await Promise.resolve();
    expect(states[3]).toEqual({ kind: 'success', source: 'gemini', guidance: 'Practice.' });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('suppresses duplicate requests and a late response after owner disposal', async () => {
    let finish!: (value: { guidance: string; source: 'gemini' }) => void;
    const load = vi.fn(() => new Promise<{ guidance: string; source: 'gemini' }>(resolve => { finish = resolve; }));
    const states: GuidanceState[] = [];
    const runner = createGuidanceRunner({ jobId: 'job', missingSkillNames: ['Electrical'], zeroGapCopy: 'None', load });
    runner.request(s => states.push(s)); runner.request(s => states.push(s));
    expect(load).toHaveBeenCalledTimes(1);
    runner.dispose(); finish({ guidance: 'Stale', source: 'gemini' }); await Promise.resolve();
    runner.request(s => states.push(s));
    expect(states).toEqual([{ kind: 'loading' }]);
    expect(guidanceOwnerKey({ accountId: 'a', jobId: 'j', baseRetry: 0, requirementsRetry: 0 })).not.toBe(guidanceOwnerKey({ accountId: 'b', jobId: 'j', baseRetry: 0, requirementsRetry: 0 }));
  });
});
