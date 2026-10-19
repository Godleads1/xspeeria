/**
 * Contact Support (Figma "Alex Mobile Assistant"), ADR-007 A10.
 *
 * Chat with an assistant avatar, bubbles, quick-reply chips, timestamps and a composer
 * (camera, "Write a comment", emoji). Answers come from the approved FAQ; anything else
 * gets an honest fallback. Secrets (codes, passwords, full account numbers) are blocked
 * before sending. Photos are not accepted here: ID documents must never go through chat
 * (Compliance Manual §3), and payment evidence belongs in the dispute flow. MOCK ONLY;
 * the conversation lives in memory.
 */

import { useRef, useState, type ReactElement } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon } from '../../components/icons';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { FAQ } from '../faq/data';
import { AssistantAvatar } from './AssistantAvatar';
import { fallbackAnswer, QUICK_REPLIES, bestAnswer, greeting, sensitiveWarning, type QuickReply } from './assistant';
import { tr } from "../../i18n";

interface Message {
  readonly id: number;
  readonly from: 'assistant' | 'user';
  readonly text: string;
  readonly at: number;
}

/** `08:20 AM`. */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

function CameraGlyph(): ReactElement {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M3 7h4l2-2.5h6L17 7h4v12H3z" fill="none" stroke={color.text.primary} strokeWidth={1.8} strokeLinejoin="round" />
      <Circle cx={12} cy={13} r={3.5} fill="none" stroke={color.text.primary} strokeWidth={1.8} />
    </Svg>
  );
}

function SmileGlyph(): ReactElement {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} fill="none" stroke={color.text.primary} strokeWidth={1.8} />
      <Circle cx={9} cy={10} r={1} fill={color.text.primary} />
      <Circle cx={15} cy={10} r={1} fill={color.text.primary} />
      <Path d="M8.5 14.5c2 2 5 2 7 0" fill="none" stroke={color.text.primary} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function SupportChatScreen({
  firstName,
  onBack,
  now = Date.now,
}: {
  firstName: string;
  onBack: () => void;
  now?: () => number;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const nextId = useRef(1);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const [messages, setMessages] = useState<readonly Message[]>(() => [
    { id: 0, from: 'assistant', text: greeting(firstName), at: now() },
  ]);
  const [draft, setDraft] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [chipsUsed, setChipsUsed] = useState(false);

  const push = (from: Message['from'], text: string): void => {
    const m: Message = { id: nextId.current++, from, text, at: now() };
    setMessages((prev) => [...prev, m]);
  };

  const ask = (text: string, answer: string): void => {
    push('user', text);
    push('assistant', answer);
    setChipsUsed(true);
  };

  const send = (): void => {
    const text = draft.trim();
    if (text === '') return;
    const warn = sensitiveWarning(text);
    if (warn) {
      setWarning(warn);
      return;
    }
    setDraft('');
    setWarning(null);
    ask(text, tr(bestAnswer(text)?.answer ?? '') || fallbackAnswer());
  };

  const chip = (q: QuickReply): void => {
    const item = FAQ.find((f) => f.id === q.faqId);
    ask(tr(q.label), item ? tr(item.answer) : fallbackAnswer());
  };

  return (
    <KeyboardAvoidingView
      testID="support-screen"
      style={[styles.screen, { paddingTop: insets.top + space.xs }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable testID="support-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr("Alex Mobile Assistant")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.thread}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.notice}>{tr("Automated assistant. Answers come from our FAQ.")}</Text>
        {messages.map((m, i) => {
          const showChips = m.id === 0 && !chipsUsed;
          return (
            <View key={m.id} style={styles.group}>
              {m.from === 'assistant' ? (
                <View style={styles.assistantRow}>
                  <AssistantAvatar size={40} />
                  <View style={styles.assistantCol}>
                    <View testID={`msg-${m.id}`} style={[styles.bubble, styles.assistantBubble]}>
                      <Text style={styles.bubbleText}>{m.text}</Text>
                    </View>
                    {showChips ? (
                      <View style={styles.chips}>
                        {QUICK_REPLIES.map((q) => (
                          <Pressable
                            key={q.faqId}
                            testID={`support-chip-${q.faqId}`}
                            accessibilityRole="button"
                            onPress={() => chip(q)}
                            style={styles.chip}
                          >
                            <Text style={styles.chipText}>{tr(q.label)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View testID={`msg-${m.id}`} style={[styles.bubble, styles.userBubble]}>
                  <Text style={[styles.bubbleText, styles.userText]}>{m.text}</Text>
                </View>
              )}
              {i === messages.length - 1 || messages[i + 1].from !== m.from ? (
                <Text style={[styles.time, m.from === 'user' ? styles.timeRight : null]}>{clockTime(m.at)}</Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {warning ? (
        <Text testID="support-warning" accessibilityLiveRegion="polite" style={styles.warning}>
          {warning}
        </Text>
      ) : null}

      <View style={[styles.composer, { paddingBottom: insets.bottom + space.xs }]}>
        <Pressable
          testID="support-camera"
          accessibilityRole="button"
          accessibilityLabel={tr("Attach a photo")}
          hitSlop={8}
          onPress={() =>
            Alert.alert(
              tr("Photos are not accepted here"),
              tr("For your safety, never send ID documents in chat. To share payment evidence for a trade, open it in History and raise a dispute."),
            )
          }
        >
          <CameraGlyph />
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            ref={input}
            testID="support-input"
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              if (warning) setWarning(null);
            }}
            placeholder={tr("Write a comment")}
            placeholderTextColor={color.text.secondary}
            accessibilityLabel={tr("Write a comment")}
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={send}
            style={styles.input}
          />
          <Pressable testID="support-emoji" accessibilityRole="button" accessibilityLabel={tr("Emoji")} hitSlop={8} onPress={() => input.current?.focus()}>
            <SmileGlyph />
          </Pressable>
        </View>
        {draft.trim() !== '' ? (
          <Pressable testID="support-send" accessibilityRole="button" accessibilityLabel={tr("Send")} onPress={send} style={styles.send}>
            <Icon name="chevron" color={color.text.onFill} size={16} weight={2.5} />
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  thread: { paddingHorizontal: space.sm, paddingVertical: space.sm, gap: space.sm },
  notice: { ...typography.caption, fontSize: 11, color: color.text.secondary, textAlign: 'center' },
  group: { gap: 6 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  assistantCol: { flex: 1, gap: 8, alignItems: 'flex-start' },
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20 },
  assistantBubble: { backgroundColor: color.bg.sunken, borderBottomLeftRadius: 6 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: color.brand.fill, borderBottomRightRadius: 6 },
  bubbleText: { ...typography.body, fontSize: 14, lineHeight: 21, color: color.text.primary },
  userText: { color: color.text.onFill },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: color.trade.sell, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { ...typography.caption, fontSize: 12, color: color.trade.sell },
  time: { ...typography.caption, fontSize: 11, color: color.text.secondary, marginLeft: 52 + 16 },
  timeRight: { alignSelf: 'flex-end', marginLeft: 0 },
  warning: { ...typography.caption, color: color.error.text, backgroundColor: color.error.surface, paddingHorizontal: space.sm, paddingVertical: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.sm,
    paddingTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border.subtle,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.bg.sunken,
    paddingHorizontal: 16,
  },
  input: { flex: 1, ...typography.body, fontSize: 14, color: color.text.primary, paddingVertical: 0 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.brand.fill, alignItems: 'center', justifyContent: 'center' },
}));
