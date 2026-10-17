/**
 * Recovery codes, shown once (ADR-008). The user must confirm they saved them. Screenshots
 * and recording are blocked while they are on screen (SEC-09), whatever the user's general
 * screenshot preference, and a copy is cleared from the clipboard after a minute (SEC-04).
 */

import { useState, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';

import { Icon } from '../../components/icons';
import { PrimaryButton } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { copySensitive } from './sensitiveClipboard';

export function RecoveryCodes({ codes, onDone }: { codes: readonly string[]; onDone: () => void }): ReactElement {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  usePreventScreenCapture('recovery-codes');
  return (
    <View testID="recovery-codes" style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.heading}>Save your recovery codes</Text>
      <Text style={styles.body}>
        If you lose your phone, each code lets you in once. Keep them somewhere safe and private. You will not see
        them again.
      </Text>
      <View style={styles.grid}>
        {codes.map((c) => (
          <Text key={c} style={styles.code}>{c}</Text>
        ))}
      </View>
      <Pressable
        testID="recovery-copy"
        accessibilityRole="button"
        onPress={() => {
          copySensitive(codes.join('\n')).then(() => setCopied(true), () => setCopied(false));
        }}
        style={styles.copy}
      >
        <Text style={styles.copyText}>{copied ? 'Copied: paste them now. They clear in 1 minute.' : 'Copy codes'}</Text>
      </Pressable>
      <Pressable
        testID="recovery-saved"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: saved }}
        onPress={() => setSaved((s) => !s)}
        style={styles.check}
      >
        <View style={[styles.box, saved ? styles.boxOn : null]}>
          {saved ? <Icon name="check" color={color.text.onFill} size={14} weight={2.5} /> : null}
        </View>
        <Text style={styles.checkText}>{"I've saved these codes somewhere safe"}</Text>
      </Pressable>
      <PrimaryButton testID="recovery-done" label="Done" onPress={onDone} disabled={!saved} />
    </View>
  );
}

const styles = themed(() => ({
  wrap: { gap: space.sm },
  heading: { ...typography.headline, ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  body: { ...typography.body, fontSize: 14, color: color.text.secondary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: color.bg.sunken,
    borderRadius: 16,
    padding: space.sm,
    rowGap: 10,
  },
  code: { width: '50%', textAlign: 'center', fontSize: 17, letterSpacing: 1, color: color.text.primary, ...brandWeight('700'), fontVariant: ['tabular-nums'] },
  copy: { alignSelf: 'center', paddingVertical: 6 },
  copyText: { ...typography.body, ...brandWeight('700'), color: color.brand.primary },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: color.border.strong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.brand.fill, borderColor: color.brand.fill },
  checkText: { flex: 1, ...typography.body, fontSize: 14, color: color.text.primary },
}));
