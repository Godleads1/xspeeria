/**
 * Mobile theme.
 *
 * A thin platform binding over `@xspeeria/tokens`. It resolves the two typography
 * roles to concrete React Native families and re-exports the semantic tokens
 * unchanged. Components import from here; none of them names a colour or a font
 * family directly.
 */

import { Platform, type TextStyle } from 'react-native';
import { color, font, interaction, radius, space } from '@xspeeria/tokens';

export { color, interaction, radius, space };

/**
 * `font.brand` is a system stack today. Satoshi is the leading candidate but is not
 * production-approved and no font files exist in this repository. Adopting it later is
 * a change to this resolver, not to any component.
 */
export const fontFamily = {
  brand: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  /**
   * The approved Inter financial/numeric role. Until the Inter asset is bundled this
   * falls back to the platform face, which also supports tabular figures — the
   * normative requirement is the rendering outcome, not a particular font build.
   */
  numeric: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
} as const;

/**
 * Applied only to currency and numeric values. `fontVariant` is honoured on Android
 * and for system faces on iOS; it is deliberately not sprayed onto ordinary labels.
 */
export const numericTextStyle: TextStyle = {
  fontFamily: fontFamily.numeric,
  fontVariant: font.numeric.tabular ? ['tabular-nums', 'lining-nums'] : undefined,
};

export const brandTextStyle: TextStyle = {
  fontFamily: fontFamily.brand,
};

/**
 * The five roles below are the approved type scale
 * (`docs/09-ui-ux/xspeeria-design-bible.md`, page 5). Sizes and line heights are taken
 * from it unchanged; the optical letter-spacing on the two display sizes is a rendering
 * detail of the system face, not a new type role.
 */
export const typography = {
  title: { ...brandTextStyle, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  sectionTitle: {
    ...brandTextStyle,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  headline: { ...brandTextStyle, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { ...brandTextStyle, fontSize: 15, lineHeight: 20, fontWeight: '400' },
  caption: { ...brandTextStyle, fontSize: 12, lineHeight: 16, fontWeight: '400' },

  /**
   * COMPONENT tier, not new scale roles: emphasis variants of `body` and `caption` used
   * for list-row labels, chip text and navigation labels. They add weight, not a new
   * size, so the approved scale is unchanged.
   */
  rowLabel: { ...brandTextStyle, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  chipLabel: { ...brandTextStyle, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  /** 11pt is a platform navigation convention; "Marketplace" must not truncate. */
  navLabel: { ...brandTextStyle, fontSize: 11, lineHeight: 14, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;
