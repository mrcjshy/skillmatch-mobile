import { Stack } from 'expo-router';

import FaqChatbot from '@/components/faq-chatbot';
import { FAQ_COPY } from '@/lib/faq';

/**
 * Worker Help & FAQ (AI-01).
 *
 * The route exists per role so the screen stays inside the already-protected
 * (worker) group and needs no guard of its own. The chatbot itself is shared
 * with the Client route because the knowledge base is the same fixed
 * developer-written content for everyone -- it reads no account, Booking or
 * payment state, so there is nothing role-specific to show. See
 * src/components/faq-chatbot.tsx.
 */
export default function WorkerHelp() {
  return (
    <>
      <Stack.Screen options={{ title: FAQ_COPY.title }} />
      <FaqChatbot />
    </>
  );
}
