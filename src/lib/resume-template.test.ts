import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/constants/theme', () => ({ SkillMatchTheme: { ui: { colors: { accent: '#1C3AA6' } } } }));

import { buildResumeHtml, type ResumeModel } from './resume';

const base: ResumeModel = {
  fullName: 'Juan Dela Cruz', email: 'juan@example.test', phone: '+639171234567', barangay: 'San Roque', city: 'Pateros',
  summary: null, isVerified: true, availability: 'available', ratingAvg: null,
  skills: [{ name: 'Carpentry', proficiency: 'expert' }, { name: 'Plumbing', proficiency: null }],
  projects: [],
};

describe('REG-01 resume template', () => {
  it('lists each skill by name only: no years (owner, 2026-11-06) and no skill level (2026-11-05)', () => {
    const html = buildResumeHtml(base);
    expect(html).toContain('<li><span class="skill">Carpentry</span></li>');
    expect(html).toContain('<li><span class="skill">Plumbing</span></li>');
    expect(html).not.toMatch(/\d+ years?\b|class="level"|\.level\b/);
    expect(html).not.toMatch(/Beginner|Intermediate|Expert/);
  });

  it('renders work experience and education only when present, escaped', () => {
    const none = buildResumeHtml(base);
    expect(none).not.toContain('Work Experience');
    expect(none).not.toContain('Education');
    const html = buildResumeHtml({
      ...base,
      jobs: [{ employer: 'A&B <Builders>', role: 'Carpenter', startYear: 2018, endYear: null }],
      education: { level: 'Vocational / TESDA', school: 'TESDA Pateros' },
    });
    expect(html).toContain('<h2>Work Experience</h2><article class="project"><h3>Carpenter</h3><div class="scale">A&amp;B &lt;Builders&gt; · 2018 – Present</div></article>');
    expect(html).toContain('<h2>Education</h2><p>Vocational / TESDA — TESDA Pateros</p>');
    expect(html.indexOf('Work Experience')).toBeLessThan(html.indexOf('Education'));
  });

  it('keeps the older model shape working (no jobs or education): the skill alone, no level', () => {
    const html = buildResumeHtml({ ...base, skills: [{ name: 'Carpentry', proficiency: 'beginner' }] });
    expect(html).toContain('<span class="skill">Carpentry</span></li>');
    expect(html).not.toMatch(/Beginner|Intermediate|Expert/);
  });
});
