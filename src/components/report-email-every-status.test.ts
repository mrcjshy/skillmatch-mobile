// @ts-expect-error -- Node-only source guard.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner direction 2026-11-05: the reporter is emailed for every review status (Under review,
 * Resolved, Dismissed), not only closing ones. The report-outcome-email function derives the
 * Under review event itself; native Admin must therefore always request it after a review.
 */
const code = (file: string) => readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('Report review emails', () => {
  it('native Admin requests the reporter email after every review status, Under review included', () => {
    const source = code('src/app/(admin)/admin/report-details.tsx');
    expect(source).toMatch(/await reviewReport\(reportId, status, validated\.response\);\s*const emailDelivered = await sendReportOutcomeEmail\(reportId\);/);
    expect(source).not.toMatch(/status === 'under_review'\s*\?\s*true/);
  });
});
