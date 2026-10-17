/**
 * FAQ (Figma), ADR-007 A7.
 *
 * "How can we help you?", keyword search, horizontally scrolling topic cards (Getting
 * Started, How to Sell, Payments), "Top Questions" with "View all", and expandable question
 * cards (+ / −). Topic cards filter the list; search matches questions and answers.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../components/icons';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { FAQ, FAQ_TOPICS, filterFaq, type FaqItem, type FaqTopic } from './data';

/** A function, not a constant: colours are read per render (light/dark). */
const TOPIC_STYLE = (): Record<FaqTopic, { icon: IconName; bg: string; fg: string }> => ({
  start: { icon: 'bell', bg: color.brand.secondarySurface, fg: color.brand.secondaryText },
  sell: { icon: 'hexagon', bg: color.success.surface, fg: color.success.text },
  payments: { icon: 'dollar', bg: color.error.surface, fg: color.error.text },
});

function QuestionCard({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }): ReactElement {
  return (
    <Pressable
      testID={`faq-${item.id}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={item.question}
      onPress={onToggle}
      style={styles.qCard}
    >
      <View style={styles.qHead}>
        <Text style={styles.question}>{item.question}</Text>
        <Icon name={open ? 'minus' : 'plus'} color={color.brand.primary} size={18} weight={2.25} />
      </View>
      {open ? (
        <>
          <View style={styles.qRule} />
          <Text testID={`faq-answer-${item.id}`} style={styles.answer}>{item.answer}</Text>
        </>
      ) : null}
    </Pressable>
  );
}

export function FaqScreen({ onBack }: { onBack: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<FaqTopic | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(FAQ[0].id);

  const filtering = query.trim() !== '' || topic !== null;
  const list = useMemo(() => {
    const matched = filterFaq(FAQ, query, topic);
    return filtering || showAll ? matched : matched.filter((i) => i.top);
  }, [query, topic, showAll, filtering]);

  const heading = topic ? FAQ_TOPICS.find((t) => t.key === topic)?.title ?? 'Questions' : query.trim() ? 'Results' : 'Top Questions';

  return (
    <View testID="faq-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="faq-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>FAQ</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.lg }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.help}>How can we help you?</Text>

        <View style={styles.search}>
          <Icon name="search" color={color.text.primary} size={22} weight={2} />
          <TextInput
            testID="faq-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Enter your keyword"
            placeholderTextColor={color.text.secondary}
            accessibilityLabel="Search questions"
            autoCorrect={false}
            maxLength={60}
            style={styles.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topics}>
          {FAQ_TOPICS.map((t) => {
            const st = TOPIC_STYLE()[t.key];
            const selected = topic === t.key;
            return (
              <Pressable
                key={t.key}
                testID={`faq-topic-${t.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Questions about ${t.title}`}
                onPress={() => setTopic(selected ? null : t.key)}
                style={[styles.topic, { backgroundColor: st.bg }, selected ? { borderColor: st.fg } : null]}
              >
                <Icon name={st.icon} color={st.fg} size={22} />
                <View>
                  <Text style={styles.topicSmall}>Questions about</Text>
                  <Text style={styles.topicTitle}>{t.title}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.listHead}>
          <Text style={styles.listTitle}>{heading}</Text>
          {!filtering ? (
            <Pressable testID="faq-view-all" accessibilityRole="button" onPress={() => setShowAll((v) => !v)} hitSlop={8}>
              <Text style={styles.viewAll}>{showAll ? 'Show less' : 'View all'}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.list}>
          {list.length === 0 ? (
            <Text testID="faq-empty" style={styles.empty}>
              No questions match. Try another keyword or contact support.
            </Text>
          ) : (
            list.map((i) => (
              <QuestionCard key={i.id} item={i} open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)} />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const TOPIC_W = 152;

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  help: { textAlign: 'center', ...typography.headline, ...brandWeight('500'), fontSize: 17, color: color.text.primary, marginTop: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: space.sm,
    marginTop: space.md,
    paddingHorizontal: space.sm,
    height: 52,
    borderRadius: 10,
    backgroundColor: color.bg.sunken,
  },
  searchInput: { flex: 1, ...typography.body, fontSize: 15, color: color.text.primary, paddingVertical: 0 },
  topics: { gap: 12, paddingHorizontal: space.sm, paddingVertical: space.md },
  topic: {
    width: TOPIC_W,
    height: 116,
    borderRadius: 10,
    padding: 14,
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  topicSmall: { ...typography.caption, fontSize: 13, color: color.text.primary },
  topicTitle: { ...typography.body, ...brandWeight('700'), fontSize: 14, color: color.text.primary },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, marginBottom: space.sm },
  listTitle: { ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  viewAll: { ...typography.body, ...brandWeight('700'), fontSize: 14, color: color.brand.primary },
  list: { paddingHorizontal: space.sm, gap: 12 },
  qCard: {
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: 10,
    paddingHorizontal: space.sm,
    paddingVertical: 18,
    gap: 10,
  },
  qHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  question: { flex: 1, ...typography.body, ...brandWeight('700'), fontSize: 15, color: color.text.primary },
  qRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.border.subtle },
  answer: { ...typography.body, fontSize: 14, lineHeight: 21, color: color.text.secondary },
  empty: { ...typography.body, color: color.text.secondary, textAlign: 'center', marginTop: space.md },
}));
