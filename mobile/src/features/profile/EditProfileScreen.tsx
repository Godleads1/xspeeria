/**
 * Edit profile (ADR-011). Banner and profile photo, then the details. Phone and email change
 * only after a code sent to the new address is confirmed; date of birth changes after an ID
 * check; legal name is fixed by KYC (Support can change it after re-verification).
 */

import { useState, type ReactElement } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/icons';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { ActionSheet } from '../market/controls';
import { longDate } from './data';
import { pickPhoto, type PhotoKind, type PickOutcome } from './photos';
import { ProfileAvatar } from './ProfileAvatar';
import { profileStore, useProfile } from './profileStore';

export type EditDestination = 'phone' | 'email' | 'dob';

function Row({
  label,
  value,
  note,
  action,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  note?: string;
  action?: string;
  onPress?: () => void;
  testID: string;
}): ReactElement {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}${note ? `. ${note}` : ''}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </Pressable>
  );
}

export function EditProfileScreen({
  onBack,
  onEdit,
  pick = pickPhoto,
}: {
  onBack: () => void;
  onEdit: (d: EditDestination) => void;
  pick?: (kind: PhotoKind) => Promise<PickOutcome>;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const p = useProfile();
  const [sheet, setSheet] = useState<PhotoKind | null>(null);

  const choose = async (kind: PhotoKind): Promise<void> => {
    setSheet(null);
    try {
      const r = await pick(kind);
      if (r.kind === 'picked') (kind === 'avatar' ? profileStore.setAvatar : profileStore.setBanner)(r.uri);
      else if (r.kind === 'denied') Alert.alert('Allow photo access', 'Allow Xspeeria to use your photos in your phone settings to choose a picture.');
    } catch {
      Alert.alert('Could not use that photo', 'Please try a different picture.');
    }
  };

  const hasPhoto = sheet === 'avatar' ? p.avatarUri !== null : p.bannerUri !== null;

  return (
    <View testID="edit-profile-screen" style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.lg }}>
        <View style={[styles.banner, { paddingTop: insets.top + space.xs }]}>
          {p.bannerUri ? <Image testID="edit-banner-photo" source={{ uri: p.bannerUri }} style={styles.bannerImage} /> : null}
          <View style={styles.bannerBar}>
            <Pressable testID="edit-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12} style={styles.roundBtn}>
              <Icon name="back" color={color.text.primary} size={20} weight={2.25} />
            </Pressable>
            <Pressable
              testID="edit-banner"
              accessibilityRole="button"
              accessibilityLabel="Change banner"
              onPress={() => setSheet('banner')}
              style={styles.chip}
            >
              <Icon name="camera" color={color.text.primary} size={16} />
              <Text style={styles.chipText}>Banner</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.avatarWrap}>
          <Pressable testID="edit-avatar" accessibilityRole="button" accessibilityLabel="Change profile photo" onPress={() => setSheet('avatar')}>
            <ProfileAvatar testID="edit-avatar-image" size={112} initials={p.initials} uri={p.avatarUri} ring={4} />
            <View style={styles.cameraBadge}>
              <Icon name="camera" color={color.text.onFill} size={16} />
            </View>
          </Pressable>
          <Text style={styles.title}>Edit profile</Text>
        </View>

        <View style={styles.list}>
          <Row testID="edit-name" label="Full Name" value={p.fullName} note="Verified by KYC. Contact Support to change your legal name." />
          <Row testID="edit-phone" label="Phone Number" value={p.phone} action="Change" onPress={() => onEdit('phone')} />
          <Row testID="edit-email" label="Email Address" value={p.email} action="Change" onPress={() => onEdit('email')} />
          <Row
            testID="edit-dob"
            label="Date of birth"
            value={longDate(p.dateOfBirth)}
            note={p.pendingDob ? `Change to ${longDate(p.pendingDob.dateOfBirth)} is under review` : undefined}
            action={p.pendingDob ? undefined : 'Change'}
            onPress={p.pendingDob ? undefined : () => onEdit('dob')}
          />
          <Row testID="edit-gender" label="Gender" value={p.gender} />
        </View>
      </ScrollView>

      <ActionSheet
        testID="photo-sheet"
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        actions={[
          { key: 'choose', label: sheet === 'banner' ? 'Choose banner' : 'Choose photo', onPress: () => void choose(sheet ?? 'avatar') },
          ...(hasPhoto
            ? [
                {
                  key: 'remove',
                  label: sheet === 'banner' ? 'Remove banner' : 'Remove photo',
                  onPress: () => {
                    (sheet === 'banner' ? profileStore.setBanner : profileStore.setAvatar)(null);
                    setSheet(null);
                  },
                },
              ]
            : []),
        ]}
      />
    </View>
  );
}

const BANNER_H = 150;

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  banner: { height: BANNER_H, backgroundColor: color.border.subtle, overflow: 'hidden' },
  bannerImage: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: BANNER_H },
  bannerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.md },
  roundBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.bg.canvas, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: color.bg.canvas, borderRadius: 18, paddingHorizontal: 12, height: 36 },
  chipText: { ...typography.caption, ...brandWeight('700'), color: color.text.primary },
  avatarWrap: { alignItems: 'center', marginTop: -56, gap: 8 },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.brand.fill,
    borderWidth: 3,
    borderColor: color.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  list: { paddingHorizontal: space.md, paddingTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: color.border.subtle,
  },
  pressed: { backgroundColor: color.bg.sunken },
  rowText: { flex: 1, gap: 2 },
  label: { ...typography.caption, fontSize: 11, color: color.text.secondary },
  value: { ...typography.body, ...brandWeight('700'), fontSize: 15, color: color.text.primary },
  note: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  action: { ...typography.body, ...brandWeight('700'), fontSize: 14, color: color.brand.primary },
}));
