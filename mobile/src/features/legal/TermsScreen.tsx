/**
 * Terms and Conditions (Figma), ADR-007 A9. Scrollable legal document: bold title block,
 * numbered sections, sub-headings and bullets. The email address opens the mail app.
 * Content: PRIVACY_POLICY — DRAFT, NOT LEGALLY REVIEWED (see privacyPolicy.ts).
 */

import type { ReactElement } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { brandWeight, color, space, typography } from '../../theme';
import { PRIVACY_POLICY, type PolicyBlock, type PolicyDocument } from './privacyPolicy';

const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

function Paragraph({ text }: { text: string }): ReactElement {
  const m = EMAIL.exec(text);
  if (!m) return <Text style={styles.p}>{text}</Text>;
  const [before, after] = [text.slice(0, m.index), text.slice(m.index + m[0].length)];
  return (
    <Text style={styles.p}>
      {before}
      <Text
        testID="terms-email"
        accessibilityRole="link"
        style={styles.link}
        onPress={() => {
          Linking.openURL(`mailto:${m[0]}`).catch(() => undefined);
        }}
      >
        {m[0]}
      </Text>
      {after}
    </Text>
  );
}

function Block({ block }: { block: PolicyBlock }): ReactElement {
  if (block.kind === 'sub') return <Text style={styles.sub}>{block.text}</Text>;
  if (block.kind === 'bullet') {
    return (
      <View style={styles.bullet}>
        <Text style={styles.p}>•</Text>
        <Text style={[styles.p, styles.bulletText]}>{block.text}</Text>
      </View>
    );
  }
  return <Paragraph text={block.text} />;
}

export function TermsScreen({ onBack, doc = PRIVACY_POLICY }: { onBack: () => void; doc?: PolicyDocument }): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View testID="terms-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="terms-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>Terms and Conditions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>
        <Text accessibilityRole="header" style={styles.docTitle}>{doc.title}</Text>
        <Text style={styles.docTitle}>Effective Date: {doc.effective}</Text>
        <Text style={[styles.docTitle, styles.titleGap]}>Last Updated: {doc.updated}</Text>
        {doc.sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text accessibilityRole="header" style={styles.h}>{s.title}</Text>
            {s.blocks.map((blk, i) => (
              <Block key={i} block={blk} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  body: { paddingHorizontal: space.sm, paddingTop: space.sm },
  docTitle: { ...typography.body, ...brandWeight('700'), fontSize: 15, lineHeight: 21, color: color.text.primary },
  titleGap: { marginBottom: space.sm },
  section: { marginTop: space.sm, gap: 2 },
  h: { ...typography.body, ...brandWeight('500'), fontSize: 15, lineHeight: 21, color: color.text.primary },
  sub: { ...typography.body, ...brandWeight('500'), fontSize: 14, lineHeight: 20, color: color.text.primary, marginTop: 2 },
  p: { ...typography.body, fontSize: 14, lineHeight: 20, color: color.text.primary },
  bullet: { flexDirection: 'row', gap: 6 },
  bulletText: { flex: 1 },
  link: { color: color.brand.primary, textDecorationLine: 'underline' },
});
