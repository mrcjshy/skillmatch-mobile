import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SkillMatchTheme } from '@/constants/theme';
import {
  entriesForCategories,
  FAQ_COPY,
  FaqEntry,
  MAX_QUERY_LENGTH,
  QUICK_TOPICS,
  resolveFaq,
  suggestedEntries,
} from '@/lib/faq';

/**
 * The FAQ / Help chatbot (AI-01), shared by the Worker and Client routes.
 *
 * It LOOKS conversational. It is not a model. Every reply is either the
 * verbatim text of one knowledge-base entry, a fixed list of knowledge-base
 * questions to choose from, or one of the fixed lines in FAQ_COPY. Nothing on
 * this screen is generated, and nothing is read from anywhere but
 * src/lib/faq.ts -- no server, no database, no storage, no session, no
 * identity. That is the D-004 boundary, enforced by what this file imports
 * rather than by a rule it promises to follow.
 *
 * WHY AMBIGUITY IS SHOWN AS CHOICES
 * ---------------------------------
 * When several entries score close together, the screen offers them as
 * tappable fixed questions instead of picking one or blending them. A
 * blended answer would be a sentence no developer wrote -- the one thing a
 * fixed-knowledge FAQ must never produce.
 *
 * EVERY DISPLAYED ANSWER KEEPS ITS SOURCE
 * ---------------------------------------
 * A bot line carries the id of the entry it came from, so any answer on
 * screen can be traced to exactly one source-controlled string.
 *
 * The transcript lives in component state and is discarded on unmount.
 * Nothing is persisted.
 */

type Line =
  | { key: number; from: 'user'; text: string }
  | { key: number; from: 'bot'; text: string; entryId: string | null; choices: FaqEntry[]; choicesLabel: string | null };

export default function FaqChatbot() {
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { key: 0, from: 'bot', text: FAQ_COPY.greeting, entryId: null, choices: [], choicesLabel: null },
  ]);
  const [nextKey, setNextKey] = useState(1);

  /** Append lines in one state update so keys stay unique and ordered. */
  function append(...items: Omit<Line, 'key'>[]) {
    setLines((prev) => [
      ...prev,
      ...items.map((item, i) => ({ ...item, key: nextKey + i }) as Line),
    ]);
    setNextKey((k) => k + items.length);
  }

  function botAnswer(entry: FaqEntry, related: FaqEntry[]) {
    return {
      from: 'bot' as const,
      text: entry.answer,
      entryId: entry.id,
      choices: related,
      choicesLabel: related.length > 0 ? FAQ_COPY.related : null,
    };
  }

  function botChoices(text: string, choices: FaqEntry[], label: string) {
    return { from: 'bot' as const, text, entryId: null, choices, choicesLabel: label };
  }

  /** The only path from free text to a reply: the pure resolver. */
  function ask(raw: string) {
    const text = raw.trim();
    if (text === '') return;
    setInput('');

    const r = resolveFaq(text);
    const user = { from: 'user' as const, text };
    switch (r.kind) {
      case 'empty':
        append(user, botChoices(FAQ_COPY.suggested, r.suggested, FAQ_COPY.choose));
        return;
      case 'none':
        // Fixed line. No attempt to guess.
        append(user, botChoices(FAQ_COPY.noMatch, suggestedEntries(), FAQ_COPY.suggested));
        return;
      case 'ambiguous':
        append(user, botChoices(FAQ_COPY.choose, r.candidates, FAQ_COPY.related));
        return;
      case 'answer':
        append(user, botAnswer(r.entry, r.related));
        return;
    }
  }

  /** Tapping a fixed question answers that exact entry -- no search. */
  function pick(entry: FaqEntry) {
    append({ from: 'user', text: entry.question }, botAnswer(entry, []));
  }

  function topic(label: string, entries: FaqEntry[]) {
    append({ from: 'user', text: label }, botChoices(FAQ_COPY.choose, entries, FAQ_COPY.related));
  }

  const canAsk = input.trim() !== '';

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.transcript}
        contentContainerStyle={styles.transcriptContent}
        keyboardShouldPersistTaps="handled"
      >
        {lines.map((line) =>
          line.from === 'user' ? (
            <View key={line.key} style={[styles.bubble, styles.userBubble]}>
              <Text style={styles.speaker}>{FAQ_COPY.youName}</Text>
              <Text style={styles.bubbleText}>{line.text}</Text>
            </View>
          ) : (
            <View key={line.key} style={[styles.bubble, styles.botBubble]}>
              <Text style={styles.speaker}>{FAQ_COPY.botName}</Text>
              <Text style={styles.bubbleText}>{line.text}</Text>
              {line.choices.length > 0 ? (
                <View style={styles.choices}>
                  {line.choicesLabel ? (
                    <Text style={styles.choicesLabel}>{line.choicesLabel}</Text>
                  ) : null}
                  {line.choices.map((entry) => (
                    <Pressable
                      key={entry.id}
                      style={styles.choice}
                      onPress={() => pick(entry)}
                      accessibilityRole="button"
                      accessibilityLabel={entry.question}
                    >
                      <Text style={styles.choiceText}>{entry.question}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )
        )}
      </ScrollView>

      <View style={styles.topics}>
        <Text style={styles.topicsLabel}>{FAQ_COPY.quickTopics}</Text>
        <View style={styles.topicRow}>
          {QUICK_TOPICS.map((t) => (
            <Pressable
              key={t.label}
              style={styles.topicChip}
              onPress={() => topic(t.label, entriesForCategories(t.categories))}
              accessibilityRole="button"
              accessibilityLabel={`${FAQ_COPY.quickTopics}: ${t.label}`}
            >
              <Text style={styles.topicChipText}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={FAQ_COPY.placeholder}
          maxLength={MAX_QUERY_LENGTH}
          returnKeyType="send"
          onSubmitEditing={() => ask(input)}
          blurOnSubmit={false}
          accessibilityLabel={FAQ_COPY.inputLabel}
          autoCapitalize="sentences"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.askButton, !canAsk ? styles.askButtonDisabled : null]}
          onPress={() => ask(input)}
          disabled={!canAsk}
          accessibilityRole="button"
          accessibilityLabel={FAQ_COPY.ask}
        >
          <Text style={styles.askButtonText}>{FAQ_COPY.ask}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  transcript: {
    flex: 1,
  },
  transcriptContent: {
    padding: 16,
    gap: 10,
  },
  bubble: {
    borderRadius: 10,
    padding: 12,
    maxWidth: '92%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#dbeafe',
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
  },
  speaker: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
    marginBottom: 2,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  choices: {
    marginTop: 8,
    gap: 6,
  },
  choicesLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
  },
  choice: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  choiceText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  topics: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  topicsLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
  },
  topicRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  topicChipText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  askButton: {
    borderWidth: 1,
    borderColor: SkillMatchTheme.brand.primary,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  askButtonDisabled: {
    opacity: 0.5,
  },
  askButtonText: {
    color: SkillMatchTheme.brand.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
