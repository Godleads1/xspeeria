/**
 * PRIMITIVE tier — raw values.
 *
 * This module is deliberately NOT re-exported from the package entry point. Product
 * components must never reference a raw value or a hue ramp; they consume the SEMANTIC
 * tier only. Keeping primitives unexported is what makes that rule enforceable rather
 * than merely documented.
 *
 * Values are the Phase 1 committed design system
 * (`docs/09-ui-ux/DESIGN_SYSTEM.md`, human-approved 2026-08-22), amended by DEC-006
 * (human-approved 2026-10-16): the brand primary is the logo navy `#001A6E`, which is
 * also the fill the Figma mobile screens actually paint for active navigation. Do not
 * normalise `#001A6E` to any other navy, and do not reintroduce the superseded palette.
 */

export const palette = {
  white: '#FFFFFF',
  blueTintedGrey50: '#F8F9FD',
  grey100: '#F3F4F6',
  grey200: '#E5E7EB',
  grey400: '#9CA3AF',
  grey500: '#6B7280',
  grey600: '#4B5563',
  grey900: '#111827',
  /** Figma Home hero card fill (node 39:2882). */
  ink900: '#191919',
  /** Figma card-chip gold, decorative only. */
  chipGold300: '#FFC738',
  chipGold500: '#FFB42E',
  /** Logo green: Figma Market "Sell" actions. */
  logoGreen: '#208B3A',
  logoGreen50: '#F4F9F5',
  /** Figma Market advert slot. */
  advertSky: '#8DD4E6',
  /** Figma card-chip contact lines. */
  chipBronze: '#B96634',

  blue50: '#EFF6FF',
  blue500: '#3B82F6',
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  blue800: '#1E40AF',
  blue900: '#1F3A8A',
  blue950: '#172554',

  /** Logo navy (vector `Asset_6.svg`) and the ladder designed for it. DEC-006. */
  /** Light navy tint for pills on sunken surfaces (Figma KYC "Current Level"). */
  navy100: '#CBD2EA',
  navy700: '#002885',
  navy900: '#001A6E',
  navy950: '#001350',

  emerald50: '#ECFDF5',
  emerald500: '#10B981',
  emerald600: '#059669',
  emerald700: '#047857',

  amber50: '#FFFBEB',
  amber500: '#F59E0B',
  amber600: '#D97706',
  amber700: '#B45309',

  red50: '#FEF2F2',
  red500: '#EF4444',
  red700: '#B91C1C',

  scrim: '#00000066',

  /**
   * Dark-mode ladder (DEC-016, 2026-10-17). A deep navy-black family so dark surfaces stay
   * on-brand, plus light tints of the existing hues for text on dark.
   */
  night950: '#0B1020',
  night900: '#151B2C',
  night850: '#1F2740',
  night800: '#262E44',
  night700: '#26315C',
  night600: '#14213D',
  slate100: '#F1F3F9',
  slate300: '#A3ABBF',
  slate500: '#7A849C',
  slate600: '#5C6478',
  slate800: '#1F2637',
  periwinkle300: '#8EA2FF',
  royal600: '#2F4BD1',
  royal500: '#3E5BE6',
  royal700: '#2539A8',
  blue300: '#93C5FD',
  blue400: '#60A5FA',
  emerald300: '#6EE7B7',
  emerald400: '#34D399',
  emeraldNight: '#0E2A22',
  amber300: '#FCD34D',
  amber400: '#FBBF24',
  amberNight: '#2D2210',
  red300: '#FCA5A5',
  red400: '#F87171',
  redNight: '#2E1416',
  logoGreenBright: '#2FA84F',
  logoGreenNight: '#10251A',
  scrimDark: '#000000A6',
} as const;

/** 8pt spacing scale. */
export const scale = {
  s2: 8,
  s3: 16,
  s4: 24,
  s6: 32,
} as const;

export const radii = {
  md: 16,
  lg: 24,
  xl: 32,
} as const;
