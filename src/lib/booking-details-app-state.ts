/**
 * Booking Details' reaction to AppState changes, React-free so the Android
 * system-prompt round-trip can be tested.
 *
 * - Leaving the app ends the inline map's sharing session (the map remounts, so
 *   collection stops and the server share is stopped; nothing resumes on return)
 *   and hides protected fields until a fresh read.
 * - Returning to the foreground hides again and re-reads while focused.
 * - Exception: the background/active pair caused by the map's own permission
 *   request or location-settings prompt (see system-prompt.ts) changes nothing
 *   here. Collection is still paused for it by the sharing hook's own AppState
 *   listener.
 */
export type DetailsAppStateDeps = {
  endPinsSession: () => void;
  hideProtected: () => void;
  reload: () => void;
  isFocused: () => boolean;
  promptPending: () => boolean;
};

export function createDetailsAppStateHandler(deps: DetailsAppStateDeps) {
  let promptRoundTrip = false;
  return (state: string) => {
    if (state !== 'active') {
      promptRoundTrip = deps.promptPending();
      if (promptRoundTrip) return;
      deps.endPinsSession();
      deps.hideProtected();
      return;
    }
    if (promptRoundTrip) {
      promptRoundTrip = false;
      return;
    }
    deps.hideProtected();
    if (deps.isFocused()) deps.reload();
  };
}
