/**
 * Home header.
 *
 * `docs/09-ui-ux/UI_UX_SCREEN_SPEC.md` specifies avatar, greeting and notification
 * button. The greeting is the screen title and sits below this bar in the `title` role,
 * so the bar itself carries only the two controls — no duplicated "Home" label, which
 * the bottom navigation already states.
 *
 * The spec calls for a gradient avatar. No gradient runtime is a dependency of this app
 * (`expo-linear-gradient` is not installed) and interpolating one by hand would mint
 * colour values outside the semantic token layer, so the avatar is the flat brand fill
 * here. That is a deliberate, single-component deviation.
 *
 * Nothing in this header renders or implies a balance.
 */

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../../components/icons';
import { brandTextStyle, color, typography } from '../../theme';

export function HomeHeader({
  initials = 'X',
  onNotifications,
}: {
  initials?: string;
  onNotifications?: () => void;
}): ReactElement {
  return (
    <View style={styles.bar}>
      <View accessible accessibilityLabel="Your account" style={styles.avatar}>
        <Text style={styles.avatarLabel}>{initials}</Text>
      </View>

      <Pressable
        testID="home-notifications"
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        onPress={onNotifications}
        style={({ pressed }) => [styles.bell, pressed ? styles.bellPressed : null]}
      >
        <Icon name="bell" color={color.text.primary} size={22} />
      </Pressable>
    </View>
  );
}

const CONTROL = 44;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    backgroundColor: color.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    ...typography.headline,
    ...brandTextStyle,
    color: color.text.onFill,
    letterSpacing: 0.2,
  },
  /**
   * A hairline circle rather than a filled control: the bell is secondary to everything
   * below it and must not compete with the primary action.
   */
  bell: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: CONTROL / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellPressed: { backgroundColor: color.bg.sunken },
});
