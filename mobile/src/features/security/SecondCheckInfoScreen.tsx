/**
 * Security → "How we check it's you" (server builds, ADR-054). Explains the checks that
 * replaced the authenticator app. Nothing here can be switched off; Fingerprint/Face ID is
 * turned on in Security.
 */

import type { ReactElement } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { MenuIcon } from '../../components/menuIcons';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { k, tr } from '../../i18n';

const POINTS = [
  [
    k('Fingerprint or Face ID'),
    k('On a phone you have logged in on before, it confirms payout accounts, deals and changes to your account. Turn it on in Security.'),
  ],
  [
    k('Face check'),
    k('After your identity check, a new phone, a forgotten PIN or a phone without fingerprint needs a quick selfie. We match it to the photo from your identity check.'),
  ],
  [k('Email and SMS codes'), k('Before your identity check, we send a code to your email, and by SMS on a new phone.')],
  [k('Email alerts'), k('We email you when someone logs in on a new phone and when your PIN or phone number changes.')],
] as const;

export function SecondCheckInfoScreen({ onBack }: { onBack: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View testID="second-check-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="second-check-back" accessibilityRole="button" accessibilityLabel={tr('Back')} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr('How we check it’s you')}</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.status}>
          <MenuIcon name="security" size={44} />
          <Text style={styles.statusText}>
            {tr('Besides your PIN, we check it’s really you on a new phone and before sensitive changes.')}
          </Text>
        </View>
        {POINTS.map(([title, body]) => (
          <View key={title} style={styles.point}>
            <Text style={styles.pointTitle}>{tr(title)}</Text>
            <Text style={styles.pointBody}>{tr(body)}</Text>
          </View>
        ))}
        <Text style={styles.note}>{tr('Xspeeria staff will never ask for your codes or your PIN.')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  spacer: { width: 22 },
  body: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.sm },
  status: { flexDirection: 'row', gap: space.sm, alignItems: 'center', backgroundColor: color.bg.sunken, borderRadius: 20, padding: space.sm },
  statusText: { flex: 1, ...typography.caption, fontSize: 13, color: color.text.secondary },
  point: { gap: 2 },
  pointTitle: { ...typography.body, ...brandWeight('700'), fontSize: 15, color: color.text.primary },
  pointBody: { ...typography.caption, fontSize: 13, color: color.text.secondary },
  note: { ...typography.caption, fontSize: 12, color: color.text.secondary, marginTop: space.sm },
}));
