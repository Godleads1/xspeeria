/**
 * Home header (Figma node 39:2882), DEC-008.
 *
 * Avatar with a "Welcome" caption and the user's name, then help and notifications.
 * The Figma avatar is a photo; until profile photos exist it shows initials on the brand
 * fill. The spec's gradient avatar is not used: no gradient runtime is a dependency.
 *
 * Help and notifications have no destination yet. They stay in the layout but are
 * disabled and drawn in the disabled colour rather than looking available and doing
 * nothing when tapped. Nothing in this header renders or implies a balance.
 */

import type { ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon, type IconName } from '../../components/icons';
import { color, typography, themed } from '../../theme';

function HeaderButton({
  icon,
  label,
  testID,
  onPress,
}: {
  icon: IconName;
  label: string;
  testID: string;
  onPress?: () => void;
}): ReactElement {
  const available = onPress !== undefined;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !available }}
      disabled={!available}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.control, pressed ? styles.controlPressed : null]}
    >
      <Icon name={icon} color={available ? color.text.primary : color.text.disabled} size={22} />
    </Pressable>
  );
}

export function HomeHeader({
  name,
  initials,
  onHelp,
  onNotifications,
}: {
  name: string;
  initials: string;
  onHelp?: () => void;
  onNotifications?: () => void;
}): ReactElement {
  return (
    <View style={styles.bar}>
      <View accessible accessibilityLabel={`Welcome, ${name}`} style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLabel}>{initials}</Text>
        </View>
        <View>
          <Text style={styles.welcome}>Welcome</Text>
          <Text style={styles.name}>{name}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <HeaderButton icon="help" label="Help" testID="home-help" onPress={onHelp} />
        <HeaderButton
          icon="bell"
          label="Notifications"
          testID="home-notifications"
          onPress={onNotifications}
        />
      </View>
    </View>
  );
}

const CONTROL = 44;

const styles = themed(() => ({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  avatar: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    backgroundColor: color.brand.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    ...typography.rowLabel,
    color: color.text.onFill,
    letterSpacing: 0.2,
  },
  welcome: { ...typography.caption, color: color.text.secondary },
  name: { ...typography.headline, color: color.text.primary },
  actions: { flexDirection: 'row', gap: 4 },
  control: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPressed: { backgroundColor: color.bg.sunken },
}));
