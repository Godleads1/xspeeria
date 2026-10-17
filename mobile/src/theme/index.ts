/**
 * Mobile theme.
 *
 * A thin platform binding over `@xspeeria/tokens`. It resolves the two typography
 * roles to concrete React Native families and re-exports the semantic tokens
 * unchanged. Components import from here; none of them names a colour or a font
 * family directly.
 */

import type { TextStyle } from 'react-native';
import { font, radius, space } from '@xspeeria/tokens';

export { radius, space };
// Colours are LIVE (light/dark, DEC-016): see ./mode.
export { color, interaction, themed, useThemeMode, getThemeMode, setThemeMode, loadSavedThemeMode, type ThemeMode } from './mode';

/**
 * Brand face: Satoshi (DEC-010, 2026-10-17), as in the Figma mobile frames. Licensed under
 * the ITF Free Font License, which allows embedding in our app but NOT redistribution:
 * the files live only in this PRIVATE repository (`mobile/assets/fonts/satoshi`).
 *
 * React Native custom fonts are selected per weight by family name, not by `fontWeight`,
 * so each weight below names its own file. Satoshi has no 600: semibold maps to Medium,
 * which is what Figma uses for labels.
 */
export const SATOSHI_FILES = {
  'Satoshi-Regular': require('../../assets/fonts/satoshi/Satoshi-Regular.otf'),
  'Satoshi-Medium': require('../../assets/fonts/satoshi/Satoshi-Medium.otf'),
  'Satoshi-Bold': require('../../assets/fonts/satoshi/Satoshi-Bold.otf'),
  'Satoshi-Black': require('../../assets/fonts/satoshi/Satoshi-Black.otf'),
} as const;

export type BrandWeight = '400' | '500' | '600' | '700' | '800' | '900';

const SATOSHI_FOR: Record<BrandWeight, keyof typeof SATOSHI_FILES> = {
  '400': 'Satoshi-Regular',
  '500': 'Satoshi-Medium',
  '600': 'Satoshi-Medium',
  '700': 'Satoshi-Bold',
  '800': 'Satoshi-Black',
  '900': 'Satoshi-Black',
};

/** Brand text at a given weight. `fontWeight` stays normal so no faux-bold is applied. */
export function brandWeight(weight: BrandWeight): TextStyle {
  return { fontFamily: SATOSHI_FOR[weight], fontWeight: 'normal' };
}

/**
 * Space Grotesk Bold — the Figma Home hero figure only (node 51:1741). SIL Open Font
 * License (redistributable), loaded from @expo-google-fonts/space-grotesk.
 */
export const SPACE_GROTESK_FILES = {
  'SpaceGrotesk-Bold': require('@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf'),
} as const;

export const heroFigureStyle: TextStyle = {
  fontFamily: 'SpaceGrotesk-Bold',
  fontWeight: 'normal',
};

export const fontFamily = {
  brand: SATOSHI_FOR['400'],
  /** Numerics use Satoshi too (DEC-010); the weight comes from the typography role. */
  numeric: SATOSHI_FOR['400'],
} as const;

/**
 * Applied only to currency and numeric values. `fontVariant` is honoured on Android
 * and for system faces on iOS; it is deliberately not sprayed onto ordinary labels.
 */
export const numericTextStyle: TextStyle = {
  // No fontFamily here: numbers inherit the Satoshi weight of their typography role.
  fontVariant: font.numeric.tabular ? ['tabular-nums', 'lining-nums'] : undefined,
};

export const brandTextStyle: TextStyle = brandWeight('400');

/**
 * The five roles below are the approved type scale
 * (`docs/09-ui-ux/xspeeria-design-bible.md`, page 5). Sizes and line heights are taken
 * from it unchanged; the optical letter-spacing on the two display sizes is a rendering
 * detail of the system face, not a new type role.
 */
export const typography = {
  title: { ...brandWeight('700'), fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  sectionTitle: {
    ...brandWeight('600'),
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  headline: { ...brandWeight('600'), fontSize: 17, lineHeight: 22 },
  body: { ...brandWeight('400'), fontSize: 15, lineHeight: 20 },
  caption: { ...brandWeight('400'), fontSize: 12, lineHeight: 16 },

  /**
   * COMPONENT tier, not new scale roles: emphasis variants of `body` and `caption` used
   * for list-row labels, chip text and navigation labels. They add weight, not a new
   * size, so the approved scale is unchanged.
   */
  rowLabel: { ...brandWeight('600'), fontSize: 15, lineHeight: 20 },
  chipLabel: { ...brandWeight('600'), fontSize: 12, lineHeight: 16 },
  /** 11pt is a platform navigation convention; labels must not truncate. */
  navLabel: { ...brandWeight('600'), fontSize: 11, lineHeight: 14 },
} as const satisfies Record<string, TextStyle>;
