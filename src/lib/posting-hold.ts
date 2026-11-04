/** How long the finished posting checklist stays up so its last check can land. */
export const POSTED_HOLD_MS = 1500;

/** Resolves after POSTED_HOLD_MS; the post-job screen awaits it before opening the posted Job. */
export function waitForPostedChecklist(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, POSTED_HOLD_MS); });
}
