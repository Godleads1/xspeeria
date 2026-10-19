/**
 * Home header (Figma node 39:2882), DEC-008.
 *
 * Avatar with a "Welcome" caption and the user's name, then help and notifications.
 * The Figma avatar is a photo: the user's own photo when set (ADR-011), otherwise initials
 * on the brand fill. The spec's gradient avatar is not used: no gradient runtime is a dependency.
 *
 * The bell opens the notification centre and shows the unread count (ADR-044). Help has no
 * destination yet: it stays in the layout but is disabled and drawn in the disabled colour
 * rather than looking available and doing nothing. Nothing here renders or implies a balance.
 */

import type { ReactElement } from 'react';
import { Pressable, Text, View, Image } from 'react-native';

import { Icon, type IconName } from '../../components/icons';
import { NotificationBadge as Badge } from '../../components/NotificationBadge';
import { color, typography, themed } from '../../theme';

function HeaderButton({
  icon,
  label,
  testID,
  onPress,
  badge = 0,
}: {
  icon: IconName;
  label: string;
  testID: string;
  onPress?: () => void;
  /** Unread count shown on the icon (ADR-044); 0 hides it. */
  badge?: number;
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
      <Badge count={badge} />
    </Pressable>
  );
}

export function HomeHeader({
  name,
  initials,
  avatarUri = null,
  onHelp,
  onNotifications,
  unread = 0,
}: {
  name: string;
  initials: string;
  /** Profile photo (ADR-011); initials when absent. */
  avatarUri?: string | null;
  onHelp?: () => void;
  onNotifications?: () => void;
  /** Unread notifications (ADR-044). */
  unread?: number;
}): ReactElement {
  return (
    <View style={styles.bar}>
      <View accessible accessibilityLabel={`Welcome, ${name}`} style={styles.identity}>
        {avatarUri ? (
          <Image testID="home-avatar-photo" source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{initials}</Text>
          </View>
        )}
        <View>
          <Text style={styles.welcome}>Welcome</Text>
          <Text style={styles.name}>{name}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <HeaderButton icon="help" label="Help" testID="home-help" onPress={onHelp} />
        <HeaderButton
          icon="bell"
          label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          testID="home-notifications"
          onPress={onNotifications}
          badge={unread}
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
