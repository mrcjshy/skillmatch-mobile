import { Stack } from 'expo-router';

import FaqChatbot from '@/components/faq-chatbot';
import { FAQ_COPY } from '@/lib/faq';

/**
 * Client Help & FAQ (AI-01).
 *
 * Same shape as the Worker route: exists per role only so it lives inside the
 * already-protected (client) group. The chatbot is shared -- the fixed
 * knowledge base is identical for every role and reads no private state.
 * See src/components/faq-chatbot.tsx.
 */
export default function ClientHelp() {
  return (
    <>
      <Stack.Screen options={{ title: FAQ_COPY.title }} />
      <FaqChatbot />
    </>
  );
}
