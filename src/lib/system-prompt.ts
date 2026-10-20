/**
 * Android shows some prompts in a separate system activity, so the app reports
 * 'background' then 'active' around them: the runtime-permission request (even
 * when already granted and nothing is displayed) and Google Play services'
 * location-settings resolution ("Location Accuracy") that expo-location opens
 * when a position watch starts. Screens use this to tell that round-trip apart
 * from the user leaving the app.
 */
let pending = 0;

export async function requestWithSystemPrompt<T>(request: () => Promise<T>): Promise<T> {
  pending += 1;
  try {
    return await request();
  } finally {
    pending -= 1;
  }
}

export function systemPromptPending() {
  return pending > 0;
}
