import { describe, expect, it, vi } from 'vitest';

import { createDetailsAppStateHandler } from './booking-details-app-state';
import { requestWithSystemPrompt, systemPromptPending } from './system-prompt';

function harness() {
  const deps = { endPinsSession: vi.fn(), hideProtected: vi.fn(), reload: vi.fn(), isFocused: () => true,
    promptPending: systemPromptPending };
  return { deps, onAppState: createDetailsAppStateHandler(deps) };
}

describe('Booking Details AppState lifecycle', () => {
  it('real backgrounding ends the map session and hides protected fields; return re-reads', () => {
    const { deps, onAppState } = harness();
    onAppState('background');
    expect(deps.endPinsSession).toHaveBeenCalledTimes(1);
    expect(deps.hideProtected).toHaveBeenCalledTimes(1);
    expect(deps.reload).not.toHaveBeenCalled();
    onAppState('active');
    expect(deps.hideProtected).toHaveBeenCalledTimes(2);
    expect(deps.reload).toHaveBeenCalledTimes(1);
    expect(deps.endPinsSession).toHaveBeenCalledTimes(1);
  });

  // E2E 2026-10-15, booking 29d054bb: Share my location -> Android GrantPermissionsActivity
  // (shown, or a ~400 ms invisible round-trip when already granted) -> 'background' -> map closed.
  it('the map permission round-trip keeps the map session and the details unhidden', async () => {
    const { deps, onAppState } = harness();
    let answer!: (value: 'granted') => void;
    const request = requestWithSystemPrompt(() => new Promise<'granted'>(resolve => { answer = resolve; }));
    expect(systemPromptPending()).toBe(true);
    onAppState('background');
    answer('granted');
    await expect(request).resolves.toBe('granted');
    expect(systemPromptPending()).toBe(false);
    onAppState('active');
    expect(deps.endPinsSession).not.toHaveBeenCalled();
    expect(deps.hideProtected).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('the active event may arrive before the permission result and is still paired', async () => {
    const { deps, onAppState } = harness();
    let answer!: (value: 'granted') => void;
    const request = requestWithSystemPrompt(() => new Promise<'granted'>(resolve => { answer = resolve; }));
    onAppState('background');
    onAppState('active');
    answer('granted');
    await request;
    expect(deps.endPinsSession).not.toHaveBeenCalled();
    expect(deps.hideProtected).not.toHaveBeenCalled();
  });

  // E2E retest 2026-10-15: watchPositionAsync opened Google Play services'
  // LocationSettingsCheckerActivity ("Location Accuracy"); declining it closed the map.
  it('the location-settings prompt during watch start keeps the map session, accepted or declined', async () => {
    for (const outcome of ['accepted', 'declined'] as const) {
      const { deps, onAppState } = harness();
      let settle!: () => void;
      const watch = requestWithSystemPrompt(() => new Promise<{ remove: () => void }>((resolve, reject) => {
        settle = () => outcome === 'accepted' ? resolve({ remove() {} }) : reject(new Error('LocationSettingsUnsatisfied'));
      }));
      onAppState('background');
      settle();
      await watch.catch(() => null);
      onAppState('active');
      expect(deps.endPinsSession).not.toHaveBeenCalled();
      expect(deps.hideProtected).not.toHaveBeenCalled();
      expect(systemPromptPending()).toBe(false);
    }
  });

  it('a denied or failed request also releases the prompt guard', async () => {
    await expect(requestWithSystemPrompt(async () => { throw new Error('denied'); })).rejects.toThrow('denied');
    expect(systemPromptPending()).toBe(false);
  });

  it('only the round-trip is exempt: a later real background ends the map session again', async () => {
    const { deps, onAppState } = harness();
    let answer!: (value: 'granted') => void;
    const request = requestWithSystemPrompt(() => new Promise<'granted'>(resolve => { answer = resolve; }));
    onAppState('background');
    answer('granted');
    await request;
    onAppState('active');
    onAppState('background');
    expect(deps.endPinsSession).toHaveBeenCalledTimes(1);
    expect(deps.hideProtected).toHaveBeenCalledTimes(1);
    onAppState('active');
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });
});
