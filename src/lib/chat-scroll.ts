/**
 * Booking chat scroll decisions, kept pure so every case is testable off-device.
 *
 * The screen reveals the latest message only for a reason: the first history
 * for this booking/account, a new arrival while the reader is already near the
 * bottom, the reader's own intentional send, the jump control, the keyboard
 * opening while near the bottom, or content settling while the reader is
 * following the latest message. It never scrolls a reader who has moved away,
 * so refreshes, replays and older-history prepends keep their place. `unseen`
 * is a LOCAL indicator only; it never touches database read status.
 *
 * While one of the screen's own reveals travels to the bottom (`pinning`),
 * its scroll events are not the reader backreading. Android throttles those
 * events and can drop the last one, so mid-flight distances must not leave the
 * reader marked away at the bottom. A drag, or any upward move, ends the pin
 * and hands the decision back to the reader.
 */

export const NEAR_BOTTOM_DP = 96;

export type ChatScrollRow = { id: string; sender_id: string };

export type ChatScrollState = {
  /** role:account:booking the state belongs to; a change starts fresh. */
  key: string | null;
  latestId: string | null;
  known: ReadonlySet<string>;
  nearBottom: boolean;
  unseen: number;
  /** A pending reveal for the screen to perform, then acknowledge with onRevealed. */
  reveal: 'none' | 'instant' | 'animated';
  ownSendPending: boolean;
  /** One of the screen's own reveals is travelling to the bottom. */
  pinning: boolean;
  /** Last reported scroll offset, to tell an upward reader move from a reveal. */
  offsetY: number | null;
};

export function initialChatScroll(key: string | null = null): ChatScrollState {
  return {
    key, latestId: null, known: new Set(), nearBottom: true, unseen: 0, reveal: 'none',
    ownSendPending: false, pinning: false, offsetY: null,
  };
}

export function distanceFromBottom(e: {
  contentOffset: { y: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
}): number {
  return Math.max(0, e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y);
}

export function onScrolled(s: ChatScrollState, distance: number, offsetY: number): ChatScrollState {
  const nearBottom = distance <= NEAR_BOTTOM_DP;
  if (s.pinning) {
    const movedUp = s.offsetY !== null && offsetY < s.offsetY;
    if (!nearBottom && !movedUp) return s.offsetY === offsetY ? s : { ...s, offsetY };
    s = { ...s, pinning: false };
  }
  if (nearBottom === s.nearBottom && (!nearBottom || s.unseen === 0) && s.offsetY === offsetY) return s;
  return { ...s, nearBottom, unseen: nearBottom ? 0 : s.unseen, offsetY };
}

/** The reader started dragging: whatever a reveal was doing, they now decide. */
export function onUserScroll(s: ChatScrollState): ChatScrollState {
  return s.pinning ? { ...s, pinning: false } : s;
}

/**
 * The thread's content height was measured against the viewport. A thread that
 * fits has nothing below it; a reader following the latest message stays there
 * as content settles, while a backreader is never moved.
 */
export function onContentMeasured(s: ChatScrollState, contentHeight: number, viewportHeight: number): ChatScrollState {
  if (contentHeight <= viewportHeight) {
    return s.nearBottom && s.unseen === 0 && !s.pinning ? s : { ...s, nearBottom: true, unseen: 0, pinning: false };
  }
  if (!s.nearBottom || s.reveal !== 'none') return s;
  return { ...s, reveal: 'instant' };
}

export function onMessages(
  previous: ChatScrollState,
  key: string,
  rows: readonly ChatScrollRow[],
  viewerId: string,
): ChatScrollState {
  const s = previous.key === key ? previous : initialChatScroll(key);
  const known = new Set(rows.map((r) => r.id));
  const latestId = rows.length > 0 ? rows[rows.length - 1].id : null;
  if (latestId === null) return { ...s, latestId, known };
  if (s.latestId === null) {
    return { ...s, latestId, known, nearBottom: true, unseen: 0, reveal: 'instant', ownSendPending: false };
  }
  if (latestId === s.latestId) return { ...s, known };

  // Arrivals are rows after the previous latest that were not already shown.
  const from = rows.findIndex((r) => r.id === s.latestId);
  const arrivals = rows.slice(from + 1).filter((r) => !s.known.has(r.id));
  if (s.ownSendPending && arrivals.some((r) => r.sender_id === viewerId)) {
    return { ...s, latestId, known, unseen: 0, nearBottom: true, reveal: 'animated', ownSendPending: false };
  }
  if (s.nearBottom) return { ...s, latestId, known, unseen: 0, reveal: 'animated' };
  const unseen = s.unseen + arrivals.filter((r) => r.sender_id !== viewerId).length;
  return { ...s, latestId, known, unseen };
}

export function onOwnSend(s: ChatScrollState): ChatScrollState {
  return { ...s, ownSendPending: true };
}

export function onJumpToLatest(s: ChatScrollState): ChatScrollState {
  return { ...s, unseen: 0, nearBottom: true, reveal: 'animated' };
}

/** A pending first-open reveal stays instant; otherwise follow the latest message only if already there. */
export function onViewportResized(s: ChatScrollState): ChatScrollState {
  if (!s.nearBottom || s.reveal === 'instant') return s;
  return s.reveal === 'animated' ? s : { ...s, reveal: 'animated' };
}

/** The screen issued the scroll; until it arrives, its own events are not the reader's. */
export function onRevealed(s: ChatScrollState): ChatScrollState {
  return s.reveal === 'none' ? s : { ...s, reveal: 'none', pinning: true };
}
