import { describe, expect, it, vi } from 'vitest';

import { runCallAction } from './call-action-task';

// Hoisted by vitest above the import: no React Native runtime in tests.
vi.mock('react-native', () => ({ AppRegistry: { registerHeadlessTask: vi.fn() } }));

const CALL = '22222222-2222-4222-8222-222222222222';

describe('RTC-05 background Decline from the call notification (owner, 2026-11-06)', () => {
  it('declines that call on the server without opening SkillMatch', async () => {
    const decline = vi.fn(async () => {});
    await runCallAction({ action: 'decline', bookingId: '11111111-1111-4111-8111-111111111111', callId: CALL }, decline);
    expect(decline).toHaveBeenCalledExactlyOnceWith(CALL);
  });

  it('ignores anything that is not a well-formed decline, and never throws', async () => {
    const decline = vi.fn(async () => {});
    for (const data of [null, {}, { action: 'answer', callId: CALL }, { action: 'decline', callId: 'nope' }, { action: 'decline', callId: 7 }]) {
      await runCallAction(data as never, decline);
    }
    expect(decline).not.toHaveBeenCalled();
    await expect(runCallAction({ action: 'decline', callId: CALL }, async () => { throw new Error('offline'); })).resolves.toBeUndefined();
  });
});
