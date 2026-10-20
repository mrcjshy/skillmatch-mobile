import { describe, expect, it } from 'vitest';

import {
  distanceFromBottom,
  initialChatScroll,
  NEAR_BOTTOM_DP,
  onContentMeasured,
  onJumpToLatest,
  onViewportResized,
  onMessages,
  onOwnSend,
  onRevealed,
  onScrolled,
  onUserScroll,
  type ChatScrollState,
} from '@/lib/chat-scroll';

const ME = 'me';
const THEM = 'them';
const row = (id: string, sender_id = THEM) => ({ id, sender_id });
const rows = (...ids: string[]) => ids.map((id) => row(id));

function opened(key = 'client:me:b1', list = rows('m1', 'm2', 'm3')): ChatScrollState {
  return onRevealed(onMessages(initialChatScroll(), key, list, ME));
}

/** The reader drags back through history: a drag starts, then scroll events report the position. */
function backread(s: ChatScrollState, distance = 500, offsetY = 100): ChatScrollState {
  return onScrolled(onUserScroll(s), distance, offsetY);
}

describe('chat scroll decisions', () => {
  it('opens at the latest message once the first history arrives, not while it is empty', () => {
    const empty = onMessages(initialChatScroll(), 'k', [], ME);
    expect(empty.reveal).toBe('none');
    const first = onMessages(empty, 'k', rows('m1', 'm2'), ME);
    expect(first.reveal).toBe('instant');
    expect(first.unseen).toBe(0);
    expect(first.nearBottom).toBe(true);
  });

  it('reveals a new message while the reader is near the bottom', () => {
    const next = onMessages(opened(), 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME);
    expect(next.reveal).toBe('animated');
    expect(next.unseen).toBe(0);
  });

  it('preserves a backreading position and counts unseen arrivals instead', () => {
    const away = backread(opened(), NEAR_BOTTOM_DP + 200);
    expect(away.nearBottom).toBe(false);
    const one = onMessages(away, 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME);
    expect(one.reveal).toBe('none');
    expect(one.unseen).toBe(1);
    const two = onMessages(one, 'client:me:b1', rows('m1', 'm2', 'm3', 'm4', 'm5'), ME);
    expect(two.unseen).toBe(2);
  });

  it('clears the local indicator when the reader scrolls back down or taps jump', () => {
    const away = onMessages(backread(opened()), 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME);
    expect(onScrolled(away, 10, 590).unseen).toBe(0);
    const jumped = onJumpToLatest(away);
    expect(jumped.unseen).toBe(0);
    expect(jumped.reveal).toBe('animated');
    expect(jumped.nearBottom).toBe(true);
  });

  it('reveals an intentional own send even while backreading', () => {
    const away = onOwnSend(backread(opened()));
    const next = onMessages(away, 'client:me:b1', [...rows('m1', 'm2', 'm3'), row('mine', ME)], ME);
    expect(next.reveal).toBe('animated');
    expect(next.unseen).toBe(0);
    expect(next.ownSendPending).toBe(false);
  });

  it('does not count my own message from another device as unseen while backreading', () => {
    const away = backread(opened());
    const next = onMessages(away, 'client:me:b1', [...rows('m1', 'm2', 'm3'), row('mine', ME)], ME);
    expect(next.reveal).toBe('none');
    expect(next.unseen).toBe(0);
  });

  it('never jumps when older history is prepended or the same rows are replayed', () => {
    const base = opened();
    const prepended = onMessages(base, 'client:me:b1', rows('m0', 'm1', 'm2', 'm3'), ME);
    expect(prepended.reveal).toBe('none');
    expect(prepended.unseen).toBe(0);
    const replay = onMessages(onMessages(base, 'client:me:b1', rows('m1', 'm2', 'm3'), ME), 'client:me:b1', rows('m1', 'm2', 'm3'), ME);
    expect(replay.reveal).toBe('none');
  });

  it('does not double count a replayed arrival while backreading', () => {
    const away = backread(opened());
    const once = onMessages(away, 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME);
    const again = onMessages(once, 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME);
    expect(again.unseen).toBe(1);
    expect(again.reveal).toBe('none');
  });

  it('keeps the latest message visible when the keyboard shrinks the viewport, near the bottom only', () => {
    expect(onViewportResized(opened()).reveal).toBe('animated');
    expect(onViewportResized(backread(opened())).reveal).toBe('none');
  });

  it('starts fresh on an account or booking change', () => {
    const away = onMessages(backread(opened()), 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME);
    const other = onMessages(away, 'client:me:b2', rows('x1'), ME);
    expect(other.unseen).toBe(0);
    expect(other.reveal).toBe('instant');
    expect(other.nearBottom).toBe(true);
    expect(other.pinning).toBe(false);
    const signedOut = onMessages(away, 'client:other:b1', [], ME);
    expect(signedOut.unseen).toBe(0);
    expect(signedOut.latestId).toBeNull();
  });

  it('measures the distance from the bottom of the content', () => {
    expect(distanceFromBottom({
      contentOffset: { y: 300 },
      contentSize: { height: 1000 },
      layoutMeasurement: { height: 600 },
    })).toBe(100);
    expect(distanceFromBottom({
      contentOffset: { y: 0 },
      contentSize: { height: 200 },
      layoutMeasurement: { height: 600 },
    })).toBe(0);
  });
});

/**
 * Regression for the Android trace of 2026-10-14: opening a 12-message thread,
 * the composer's appearance resized the viewport before the content was
 * measured, and the throttled scroll events of the screen's own scrollToEnd
 * stopped part-way (distance 642, then 330) without a final event at the
 * bottom. Those mid-flight readings marked the reader away, so the jump arrow
 * stayed on although the latest message was showing.
 */
describe('chat scroll — own reveals versus reader intent', () => {
  it('keeps the first-open reveal instant when the viewport settles before the content', () => {
    const pending = onMessages(initialChatScroll(), 'client:me:b1', rows('m1', 'm2'), ME);
    expect(onViewportResized(pending).reveal).toBe('instant');
  });

  it('is not marked away by the mid-flight events of its own reveal, even if the final event is dropped', () => {
    let s = opened();
    s = onScrolled(s, 642, 13);
    s = onScrolled(s, 330, 325);
    expect(s.nearBottom).toBe(true);
    expect(s.unseen).toBe(0);
  });

  it('keeps a deliberate jump settled at the latest message while it travels', () => {
    let s = onRevealed(onJumpToLatest(onMessages(backread(opened()), 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME)));
    s = onScrolled(s, 400, 200);
    s = onScrolled(s, 150, 450);
    expect(s.nearBottom).toBe(true);
    expect(s.unseen).toBe(0);
  });

  it('hands control back to the reader as soon as they drag', () => {
    const s = onScrolled(onUserScroll(onScrolled(opened(), 330, 325)), 500, 155);
    expect(s.nearBottom).toBe(false);
    expect(s.pinning).toBe(false);
  });

  it('treats an upward move without a drag (for example an accessibility scroll) as the reader', () => {
    const s = onScrolled(onScrolled(opened(), 330, 325), 455, 200);
    expect(s.nearBottom).toBe(false);
  });

  it('ends its own reveal once it arrives at the bottom, so later reading counts normally', () => {
    const arrived = onScrolled(opened(), 0, 655);
    expect(arrived.pinning).toBe(false);
    expect(onScrolled(arrived, 500, 155).nearBottom).toBe(false);
  });

  it('never shows the reader as away when the whole thread fits in the viewport', () => {
    const away = onMessages(backread(opened()), 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME);
    expect(away.unseen).toBe(1);
    const fits = onContentMeasured(away, 500, 654);
    expect(fits.nearBottom).toBe(true);
    expect(fits.unseen).toBe(0);
    expect(fits.reveal).toBe('none');
  });

  it('stays on the latest message as content settles while following, but keeps a backreader in place', () => {
    expect(onContentMeasured(opened(), 1309, 654).reveal).toBe('instant');
    const arrival = onMessages(opened(), 'client:me:b1', rows('m1', 'm2', 'm3', 'm4'), ME);
    expect(onContentMeasured(arrival, 1400, 654).reveal).toBe('animated');
    expect(onContentMeasured(backread(opened()), 1400, 654).reveal).toBe('none');
  });

  it('does not churn state for a drag when nothing is in flight', () => {
    const settled = onScrolled(opened(), 0, 655);
    expect(onUserScroll(settled)).toBe(settled);
  });
});
