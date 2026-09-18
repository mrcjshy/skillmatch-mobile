import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppChip } from '@/components/app-chip';
import { AppField } from '@/components/app-field';
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

const { colors, type, spacing, radius, size } = SkillMatchTheme.ui;

/** Expand the 28dp chip to a 44dp hit target without changing its look. */
const TOPIC_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 } as const;

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
                    <AppButton
                      key={entry.id}
                      label={entry.question}
                      variant="ghost"
                      onPress={() => pick(entry)}
                      accessibilityLabel={entry.question}
                      style={styles.choice}
                    />
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
              onPress={() => topic(t.label, entriesForCategories(t.categories))}
              accessibilityRole="button"
              accessibilityLabel={`${FAQ_COPY.quickTopics}: ${t.label}`}
              hitSlop={TOPIC_HIT_SLOP}
              style={({ pressed }) => [pressed ? styles.topicPressed : null]}
            >
              <AppChip label={t.label} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.composer}>
        <AppField
          variant="search"
          containerStyle={styles.composerField}
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
        <AppButton
          label={FAQ_COPY.ask}
          onPress={() => ask(input)}
          disabled={!canAsk}
          accessibilityLabel={FAQ_COPY.ask}
          style={styles.askButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  transcript: {
    flex: 1,
  },
  transcriptContent: {
    padding: spacing.gutter,
    gap: spacing.md,
  },
  bubble: {
    borderRadius: radius.lg,
    padding: spacing.md,
    maxWidth: '92%',
    borderCurve: 'continuous',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentSoft,
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceSubtle,
  },
  speaker: {
    ...type.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xxs,
  },
  bubbleText: {
    ...type.body,
    color: colors.textPrimary,
  },
  choices: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  choicesLabel: {
    ...type.caption,
    color: colors.textSecondary,
  },
  choice: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  topics: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  topicsLabel: {
    ...type.caption,
    color: colors.textSecondary,
  },
  topicRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  topicPressed: {
    opacity: 0.72,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.gutter,
  },
  composerField: {
    flex: 1,
  },
  askButton: {
    alignSelf: 'center',
    height: size.searchHeight,
    paddingHorizontal: spacing.lg,
  },
});
