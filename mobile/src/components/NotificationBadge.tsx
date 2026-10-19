/** Design spec §4.3 Notification Badge (ADR-044): numeric pill on the bell, "9+" cap, hidden at zero. */

import type { ReactElement } from 'react';
import { Text, View } from 'react-native';

import { color, typography, themed } from '../theme';

export function NotificationBadge({ count }: { count: number }): ReactElement | null {
  if (count <= 0) return null;
  return (
    <View testID="notification-badge" style={styles.badge} pointerEvents="none">
      <Text style={styles.text}>{count > 9 ? '9+' : String(count)}</Text>
    </View>
  );
}

const styles = themed(() => ({
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: color.error.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...typography.chipLabel, fontSize: 10, lineHeight: 12, color: color.text.onFill },
}));
