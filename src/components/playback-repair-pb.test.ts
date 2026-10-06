// @ts-expect-error -- Node-only source-contract harness; not native layout evidence.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const src = (file: string): string => readFileSync(file, 'utf8');

it('PB-01: only the first SUBSCRIBED catch-up preserves the freshly read projection; load still hides by default', () => {
  const s = src('src/components/booking-details.tsx');
  expect(s).toMatch(/async \(options\?: \{ preserveProtected\?: boolean \}\) => \{\s*if \(options\?\.preserveProtected !== true\) hideProtectedProjection\(\);/);
  expect(s).toMatch(/initialCatchUp: true \}/);
  expect(s).toMatch(/reason: 'subscribed',\s*displayedStatus: displayedStatusRef\.current,\s*initialCatchUp: run\.initialCatchUp,/);
  expect(s).toMatch(/run\.initialCatchUp = false;\s*if \(!preserveProtected\) hideProtectedProjection\(\);/);
  expect(s).toMatch(/load\(\{ preserveProtected \}\)/);
  // Broadcast events, lost channels and app-state changes still hide through their own hooks.
  expect(s).toMatch(/onBroadcastEvent: hideProtectedProjection/);
  expect(s).toMatch(/onUnavailable: hideProtectedProjection/);
});

it('PB-03: the Job Opportunity hero icon opts into the synchronous glyph path; other ServiceMarks keep their route', () => {
  expect(src('src/components/job-opportunity-details.tsx')).toContain('<ServiceMark subject={opportunity.title} synchronousGlyph />');
  expect(src('src/components/service-mark.tsx')).toContain('synchronousGlyph={synchronousGlyph}');
  for (const file of ['src/components/booking-compact-card.tsx', 'src/components/job-opportunity-compact-card.tsx']) {
    expect(src(file)).not.toContain('synchronousGlyph');
  }
});
