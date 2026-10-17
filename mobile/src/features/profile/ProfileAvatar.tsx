/** The user's photo, or their initials on the brand fill when there is none (ADR-011). */

import type { ReactElement } from 'react';
import { Image, Text, View } from 'react-native';

import { brandWeight, color } from '../../theme';

export function ProfileAvatar({
  size,
  initials,
  uri,
  ring = 0,
  testID,
}: {
  size: number;
  initials: string;
  uri: string | null;
  /** Canvas-coloured ring (Account details overlaps the banner). */
  ring?: number;
  testID?: string;
}): ReactElement {
  const frame = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: ring,
    borderColor: color.bg.canvas,
    backgroundColor: color.brand.fill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };
  return (
    <View testID={testID} style={frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {uri ? (
        <Image testID={testID ? `${testID}-photo` : undefined} source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ ...brandWeight('700'), fontSize: Math.round(size * 0.32), color: color.text.onFill }}>{initials}</Text>
      )}
    </View>
  );
}
