// @ts-expect-error -- Node-only static source check.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ANNOUNCE_CALLS = Number(/export const ANNOUNCE_CALLS = (\d+);/.exec(readFileSync('src/components/motion.tsx', 'utf8'))?.[1]);

describe('Posted-job celebration (source contract)', () => {
  const source = readFileSync('src/components/posted-job-celebration.tsx', 'utf8');
  const route = readFileSync('src/app/(client)/client/job-details.tsx', 'utf8');
  const motion = readFileSync('src/components/motion.tsx', 'utf8');

  it('celebrates first, then announces with the megaphone, and closes itself', () => {
    expect(source).toContain("<SkillMatchMascot expression=\"celebrate\"");
    expect(source).toContain("require('@/assets/images/mascot/itik-megaphone.png')");
    expect(source).toMatch(/setTimeout\(\(\) => setPhase\('announce'\), CELEBRATE_MS\)/);
    expect(source).toMatch(/setTimeout\(onClose, CELEBRATION_MS\)/);
  });

  it('keeps the motion finite and still under reduced motion', () => {
    expect(ANNOUNCE_CALLS).toBeGreaterThan(0);
    expect(motion).toMatch(/withRepeat\(withSequence\(withTiming\(1, out\), withTiming\(0, back\)\), ANNOUNCE_CALLS, false\)/);
    expect(motion).toMatch(/if \(reduced \|\| !play\) return;/);
  });

  it('shows only on arrival from Post job and clears the flag so a restore never replays it', () => {
    expect(route).toContain("useState(posted === '1')");
    expect(route).toContain('router.setParams({ posted: undefined })');
  });
});
