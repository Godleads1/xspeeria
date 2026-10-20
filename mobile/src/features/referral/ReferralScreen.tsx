/**
 * Referral Program (Figma 1041:11976), ADR-007 A8 / ADR-009.
 *
 * Illustration, "Refer a friend, get 10% off!", the reward line, referral code with Copy,
 * a "Friends joined" box (a count, never earnings), and "Invite Friends" (system share).
 */

import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { ReferralArt } from './ReferralArt';
import { REFERRAL, inviteMessage } from './data';
import { tr } from "../../i18n";

export function ReferralScreen({
  onBack,
  code = REFERRAL.code,
  friendsJoined = REFERRAL.friendsJoined,
  share = (message: string) => Share.share({ message }).then(() => undefined),
}: {
  onBack: () => void;
  code?: string;
  friendsJoined?: number;
  share?: (message: string) => Promise<void>;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  return (
    <View testID="referral-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="referral-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>{tr("Referral Program")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.art}>
          <ReferralArt width={280} />
        </View>

        <Text accessibilityRole="header" style={styles.heading}>{tr("Refer a friend, get 10% off!")}</Text>
        <Text style={styles.text}>{tr("Share your unique referral code, and both you and your friend will get 10% off the coordination fee on your next currency exchange!")}</Text>

        <View style={styles.codeRow}>
          <Text style={styles.codeLabel}>{tr("Referral Code")}</Text>
          <View style={styles.codeBox}>
            <Text testID="referral-code" selectable style={styles.code}>{code}</Text>
          </View>
          <Pressable
            testID="referral-copy"
            accessibilityRole="button"
            accessibilityLabel={tr("Copy referral code")}
            hitSlop={8}
            onPress={() => {
              Clipboard.setStringAsync(code).then(() => setCopied(true), () => setCopied(false));
            }}
            style={styles.copy}
          >
            <Icon name="copy" color={color.text.secondary} size={14} />
            <Text style={styles.copyText}>{copied ? tr("Copied") : tr("Copy")}</Text>
          </Pressable>
        </View>

        <View style={styles.countBox} accessible accessibilityLabel={tr("Friends joined: {{friendsJoined}}", { friendsJoined })}>
          <Text style={styles.countLabel}>{tr("Friends joined")}</Text>
          <Text testID="referral-count" style={styles.countValue}>{friendsJoined}</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        <PrimaryButton
          testID="referral-invite"
          label={tr("Invite Friends")}
          onPress={() => {
            share(inviteMessage(code)).catch(() => undefined);
          }}
        />
      </View>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  body: { paddingHorizontal: space.md, gap: space.sm, paddingBottom: space.lg },
  art: { alignItems: 'center', paddingVertical: space.md },
  heading: { ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  text: { ...typography.body, fontSize: 15, lineHeight: 22, color: color.text.primary },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.xs },
  codeLabel: { ...typography.body, fontSize: 15, color: color.text.primary },
  codeBox: { backgroundColor: color.bg.sunken, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  code: { fontSize: 22, letterSpacing: 1, color: color.text.primary, ...brandWeight('700') },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText: { ...typography.caption, color: color.text.secondary },
  countBox: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  countLabel: { ...typography.body, fontSize: 15, color: color.text.primary },
  countValue: { fontSize: 18, color: color.text.primary, ...brandWeight('700') },
  footer: { paddingHorizontal: space.md, paddingTop: space.xs },
}));
