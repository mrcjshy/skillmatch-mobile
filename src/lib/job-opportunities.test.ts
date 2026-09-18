import { beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import {
  ACCEPT_JOB_COPY,
  ACCEPT_JOB_ERROR,
  INELIGIBILITY_REASON,
  JobOpportunityError,
  acceptJobNotice,
  acceptJobOpportunity,
  classifyAcceptJobErrorCode,
  compactOpportunityFields,
  compactPrimarySkillName,
  findOpportunityById,
  formatLocationScoreLine,
  formatMatchPoints,
  formatOpportunityArea,
  formatOpportunityBudget,
  formatOpportunityMatchLine,
  formatOpportunityMatchTotal,
  formatOpportunitySchedule,
  formatRatingScoreLine,
  formatSkillScoreLine,
  loadMyJobOpportunities,
  parseJobOpportunity,
  parseJobOpportunityRows,
  previewOpportunityDescription,
  type JobOpportunity,
} from './job-opportunities';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('./skill-gap', () => ({
  loadJobRequiredSkills: vi.fn(async () => []),
}));

const rpc = vi.mocked(supabase.rpc);
const from = vi.mocked(supabase.from);

const JOB_A = '11111111-1111-4111-8111-111111111111';
const JOB_B = '22222222-2222-4222-8222-222222222222';

function validRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    job_id: JOB_A,
    title: 'Carpinter',
    description: 'Repair a wooden cabinet in the kitchen.',
    barangay: 'Santa Ana',
    city: 'Pateros',
    budget: 1500,
    scheduled_at: '2026-09-20T01:00:00.000Z',
    skill_points: 50,
    location_points: 30,
    rating_points: 16,
    total_points: 96,
    payment_method: 'cod',
    ...overrides,
  };
}

function parsed(overrides: Record<string, unknown> = {}): JobOpportunity {
  const row = parseJobOpportunity(validRow(overrides));
  if (row === null) throw new Error('expected a valid opportunity');
  return row;
}

describe('parseJobOpportunity', () => {
  it('parses the twelve list_my_job_opportunities fields', () => {
    expect(parseJobOpportunity(validRow())).toEqual({
      job_id: JOB_A,
      title: 'Carpinter',
      description: 'Repair a wooden cabinet in the kitchen.',
      barangay: 'Santa Ana',
      city: 'Pateros',
      budget: 1500,
      scheduled_at: '2026-09-20T01:00:00.000Z',
      skill_points: 50,
      location_points: 30,
      rating_points: 16,
      total_points: 96,
      payment_method: 'cod',
    });
  });

  it('coerces numeric strings for scores and budget', () => {
    const row = parseJobOpportunity(
      validRow({
        budget: '800.50',
        skill_points: '50',
        location_points: '12.5',
        rating_points: '20',
        total_points: '82.5',
      })
    );
    expect(row).toMatchObject({
      budget: 800.5,
      skill_points: 50,
      location_points: 12.5,
      rating_points: 20,
      total_points: 82.5,
    });
  });

  it('treats blank optional text as null and accepts a legacy null payment method', () => {
    expect(
      parseJobOpportunity(
        validRow({
          description: '   ',
          barangay: '',
          city: null,
          scheduled_at: '',
          budget: null,
          payment_method: null,
        })
      )
    ).toMatchObject({
      description: null,
      barangay: null,
      city: null,
      scheduled_at: null,
      budget: null,
      payment_method: null,
    });
  });

  it('drops a row missing job_id, title, or any score', () => {
    expect(parseJobOpportunity(validRow({ job_id: null }))).toBeNull();
    expect(parseJobOpportunity(validRow({ title: null }))).toBeNull();
    expect(parseJobOpportunity(validRow({ skill_points: null }))).toBeNull();
    expect(parseJobOpportunity(validRow({ location_points: 'nope' }))).toBeNull();
    expect(parseJobOpportunity(validRow({ rating_points: undefined }))).toBeNull();
    expect(parseJobOpportunity(validRow({ total_points: Number.NaN }))).toBeNull();
  });

  it('drops a row with a malformed payment method instead of treating it as legacy', () => {
    expect(parseJobOpportunity(validRow({ payment_method: 'gcash' }))).toBeNull();
    expect(parseJobOpportunity(validRow({ payment_method: 'cash' }))).toBeNull();
  });

  it('rejects a non-object row', () => {
    expect(parseJobOpportunity(null)).toBeNull();
    expect(parseJobOpportunity('job')).toBeNull();
  });
});

describe('parseJobOpportunityRows', () => {
  it('keeps server order and drops malformed rows', () => {
    const rows = parseJobOpportunityRows([
      validRow({ job_id: JOB_B, title: 'Plumbing Repair Assistance', total_points: 90 }),
      validRow({ job_id: null }),
      validRow({ title: 'Carpinter', total_points: 96 }),
    ]);
    expect(rows.map((row) => row.job_id)).toEqual([JOB_B, JOB_A]);
  });

  it('returns an empty list for a non-array payload', () => {
    expect(parseJobOpportunityRows(null)).toEqual([]);
    expect(parseJobOpportunityRows({ job_id: JOB_A })).toEqual([]);
  });
});

describe('findOpportunityById', () => {
  const rows = [
    parsed({ job_id: JOB_B, title: 'Plumbing Repair Assistance' }),
    parsed({ job_id: JOB_A, title: 'Carpinter' }),
  ];

  it('finds the row whose job_id matches', () => {
    expect(findOpportunityById(rows, JOB_A)?.title).toBe('Carpinter');
    expect(findOpportunityById(rows, JOB_B)?.title).toBe('Plumbing Repair Assistance');
  });

  it('returns the first match when job_id is duplicated', () => {
    const duplicated = [...rows, parsed({ job_id: JOB_A, title: 'Later copy' })];
    expect(findOpportunityById(duplicated, JOB_A)?.title).toBe('Carpinter');
  });

  it('returns null when the id is missing, blank, or the list is empty', () => {
    expect(findOpportunityById(rows, '33333333-3333-4333-8333-333333333333')).toBeNull();
    expect(findOpportunityById(rows, '  ')).toBeNull();
    expect(findOpportunityById([], JOB_A)).toBeNull();
  });
});

describe('compact field helpers', () => {
  it('joins barangay and city and drops absent parts', () => {
    expect(formatOpportunityArea('Santa Ana', 'Pateros')).toBe('Santa Ana, Pateros');
    expect(formatOpportunityArea('Santa Ana', null)).toBe('Santa Ana');
    expect(formatOpportunityArea(null, 'Pateros')).toBe('Pateros');
    expect(formatOpportunityArea(null, null)).toBeNull();
  });

  it('formats a locale-independent peso budget', () => {
    expect(formatOpportunityBudget(1500)).toBe('₱1,500');
    expect(formatOpportunityBudget(800.5)).toBe('₱800.50');
    expect(formatOpportunityBudget(null)).toBeNull();
  });

  it('leaves a missing schedule blank and formats a real timestamp', () => {
    expect(formatOpportunitySchedule(null)).toBeNull();
    expect(formatOpportunitySchedule('2026-09-20T01:00:00.000Z')).not.toBeNull();
  });

  it('formats match total/100 without trailing zeros on whole scores', () => {
    expect(formatMatchPoints(96)).toBe('96');
    expect(formatMatchPoints(12.5)).toBe('12.5');
    expect(formatOpportunityMatchTotal(96)).toBe('96/100');
    expect(formatOpportunityMatchLine(96)).toBe('Match Score: 96/100');
    expect(formatSkillScoreLine(50)).toBe('Skill: 50/50');
    expect(formatLocationScoreLine(30)).toBe('Location: 30/30');
    expect(formatRatingScoreLine(16)).toBe('Rating score: 16/20');
  });

  it('previews a trimmed description and ignores blanks', () => {
    expect(previewOpportunityDescription('  Fix the sink.  ')).toBe('Fix the sink.');
    expect(previewOpportunityDescription('   ')).toBeNull();
    expect(previewOpportunityDescription(null)).toBeNull();
  });

  it('keeps a provided primary skill name and drops blanks', () => {
    expect(compactPrimarySkillName('  Plumbing  ')).toBe('Plumbing');
    expect(compactPrimarySkillName('')).toBeNull();
    expect(compactPrimarySkillName(undefined)).toBeNull();
  });

  it('builds compact card fields without score-component breakdown', () => {
    const fields = compactOpportunityFields(parsed(), 'Carpentry');
    expect(fields).toEqual({
      title: 'Carpinter',
      primarySkillName: 'Carpentry',
      descriptionPreview: 'Repair a wooden cabinet in the kitchen.',
      area: 'Santa Ana, Pateros',
      schedule: formatOpportunitySchedule('2026-09-20T01:00:00.000Z'),
      budget: '₱1,500',
      matchTotal: '96/100',
      matchLine: 'Match Score: 96/100',
    });
    expect(fields).not.toHaveProperty('skillPoints');
    expect(JSON.stringify(fields)).not.toContain('/50');
    expect(JSON.stringify(fields)).not.toContain('/30');
    expect(JSON.stringify(fields)).not.toContain('/20');
  });
});

describe('classifyAcceptJobErrorCode', () => {
  it('classifies SM409 as unavailable and SM403 as ineligible', () => {
    expect(classifyAcceptJobErrorCode(ACCEPT_JOB_ERROR.UNAVAILABLE)).toBe('unavailable');
    expect(classifyAcceptJobErrorCode(ACCEPT_JOB_ERROR.INELIGIBLE)).toBe('ineligible');
  });

  it('maps 42501 and any other code to generic copy, never the raw message', () => {
    expect(classifyAcceptJobErrorCode(ACCEPT_JOB_ERROR.FORBIDDEN)).toBe('generic');
    expect(classifyAcceptJobErrorCode('57014')).toBe('generic');
    expect(classifyAcceptJobErrorCode(null)).toBe('generic');
    expect(acceptJobNotice({ status: 'generic' })).toEqual({
      tone: 'warning',
      headline: ACCEPT_JOB_COPY.generic,
      detail: null,
    });
    expect(ACCEPT_JOB_COPY.generic).not.toMatch(/42501|not authorized/i);
  });

  it('keeps SM409/SM403 user-facing copy distinct', () => {
    expect(acceptJobNotice({ status: 'unavailable' }).headline).toBe(ACCEPT_JOB_COPY.taken);
    expect(acceptJobNotice({ status: 'ineligible', reason: INELIGIBILITY_REASON.unverified })).toEqual({
      tone: 'warning',
      headline: ACCEPT_JOB_COPY.ineligible,
      detail: INELIGIBILITY_REASON.unverified,
    });
    expect(acceptJobNotice({ status: 'accepted' }).headline).toBe(ACCEPT_JOB_COPY.accepted);
  });
});

describe('loadMyJobOpportunities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the zero-argument list RPC and parses rows in server order', async () => {
    rpc.mockResolvedValue({
      data: [validRow({ job_id: JOB_B, title: 'First' }), validRow({ title: 'Second' })],
      error: null,
    } as never);

    const rows = await loadMyJobOpportunities();
    expect(rpc).toHaveBeenCalledWith('list_my_job_opportunities');
    expect(rpc.mock.calls[0]?.[1]).toBeUndefined();
    expect(rows.map((row) => row.title)).toEqual(['First', 'Second']);
  });

  it('throws JobOpportunityError when the list RPC fails', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'not authorized to view opportunities' },
    } as never);

    await expect(loadMyJobOpportunities()).rejects.toBeInstanceOf(JobOpportunityError);
  });
});

describe('acceptJobOpportunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends only p_job_id to accept_job_opportunity', async () => {
    rpc.mockResolvedValue({ data: null, error: null } as never);
    await expect(acceptJobOpportunity(JOB_A, 'user-1')).resolves.toEqual({ status: 'accepted' });
    expect(rpc).toHaveBeenCalledWith('accept_job_opportunity', { p_job_id: JOB_A });
  });

  it('classifies SM409 without inventing a winner', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'SM409', message: 'this opportunity is no longer available' },
    } as never);
    await expect(acceptJobOpportunity(JOB_A)).resolves.toEqual({ status: 'unavailable' });
    expect(from).not.toHaveBeenCalled();
  });

  it('classifies 42501 as generic and never returns the raw database message', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'not authorized to accept opportunities' },
    } as never);
    const result = await acceptJobOpportunity(JOB_A);
    expect(result).toEqual({ status: 'generic' });
    expect(JSON.stringify(result)).not.toContain('not authorized');
  });

  it('classifies SM403 and falls back to the unexplained reason when the profile read fails', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'SM403', message: 'you are no longer eligible for this opportunity' },
    } as never);
    from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'read failed' } }),
        })),
      })),
    } as never);

    await expect(acceptJobOpportunity(JOB_A, 'user-1')).resolves.toEqual({
      status: 'ineligible',
      reason: INELIGIBILITY_REASON.unexplained,
    });
  });
});
