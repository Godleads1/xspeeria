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

  blue500: '#3B82F6',
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  blue800: '#1E40AF',
  blue900: '#1F3A8A',
  blue950: '#172554',

  /** Logo navy (vector `Asset_6.svg`) and the ladder designed for it. DEC-006. */
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
