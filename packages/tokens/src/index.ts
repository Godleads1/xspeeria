/**
 * SEMANTIC tier — the only tier product applications may consume.
 *
 * Source of truth: `docs/09-ui-ux/DESIGN_SYSTEM.md`, human-approved 2026-08-22, as amended
 * by DEC-005 (brand primary `#001A6E`, human-approved 2026-10-16).
 * Primitives are intentionally not re-exported from this entry point.
 *
 * Architecture: PRIMITIVE -> SEMANTIC -> COMPONENT.
 */

import { palette, radii, scale } from './primitives';

export const color = {
  bg: {
    /** Primary application canvas. */
    canvas: palette.white,
    /**
     * Supporting/sunken surface ONLY: grouped lists, table headers, read-only recaps,
     * empty states. 1.05:1 against the canvas, so it can never be the sole separator —
     * always pair it with a border, spacing or elevation.
     */
    sunken: palette.blueTintedGrey50,
    overlay: palette.scrim,
  },

  text: {
    /** Headings, high-emphasis labels, primary content. 17.74:1. */
    primary: palette.grey900,
    /** Body copy, descriptions, supporting text, metadata. 7.56:1. */
    secondary: palette.grey600,
    /** Genuinely disabled/inactive text only. 2.54:1 — WCAG 1.4.3 exemption. */
    disabled: palette.grey400,
    /** Text on a filled brand or status surface. */
    onFill: palette.white,
  },

  border: {
    /** Decorative only: dividers, table rules, container edges. 1.24:1. */
    subtle: palette.grey200,
    /**
     * Meaningful boundaries: text inputs, selectable rows, interactive form fields.
     * 4.83:1. `subtle` must never be the sole boundary of a control.
     */
    strong: palette.grey500,
    /** Focus ring. 6.70:1 on canvas. */
    focus: palette.blue700,
  },

  brand: {
    /** Logo navy, DEC-005. 15.30:1 on canvas; white on it is also 15.30:1. */
    primary: palette.navy900,
    /**
     * 3.68:1 — passes for large text and UI components, FAILS AA for normal-size text.
     * Use `brand.secondaryText` where normal-size text is required.
     */
    secondary: palette.blue500,
    /** 5.17:1 — normal-size text and small filled labels. */
    secondaryText: palette.blue600,
  },

  success: {
    /** Filled badge with `text.primary` on it (6.99:1). Not text, not a lone icon. */
    fill: palette.emerald500,
    surface: palette.emerald50,
    /** Meaningful boundary and icon. 3.77:1. */
    border: palette.emerald600,
    /** Normal-size text. 5.48:1. */
    text: palette.emerald700,
  },

  warning: {
    /** Filled badge with `text.primary` on it (8.26:1). Not text, not a lone icon. */
    fill: palette.amber500,
    surface: palette.amber50,
    border: palette.amber600,
    text: palette.amber700,
  },

  error: {
    /** Icon, large text, boundary, or filled badge with `text.primary` (4.71:1). */
    fill: palette.red500,
    surface: palette.red50,
    border: palette.red500,
    /** 6.47:1 on canvas, 5.91:1 on `error.surface`. `#DC2626` is deliberately unused. */
    text: palette.red700,
  },
} as const;

export const interaction = {
  primary: {
    default: palette.navy900,
    /** Lighter on hover: the dark navy base has little darkening headroom. 12.79:1. */
    hover: palette.navy700,
    /**
     * Darker on press. 17.37:1. `blue950` (#172554) is LIGHTER than the navy default and
     * would read as no feedback at all, so the ladder designed for this navy is used.
     */
    pressed: palette.navy950,
    /** NOT `brand.secondary` — that measures 2.81:1 against the primary fill. */
    focus: palette.blue700,
    /** A fill swap, never reduced opacity over an arbitrary background. */
    disabledFill: palette.grey100,
    disabledLabel: palette.grey500,
  },
} as const;

export const space = {
  xs: scale.s2,
  sm: scale.s3,
  md: scale.s4,
  lg: scale.s6,
} as const;

export const radius = {
  md: radii.md,
  lg: radii.lg,
  xl: radii.xl,
} as const;

/**
 * Typography roles.
 *
 * `brand` resolves to a platform-safe system stack today. Satoshi is the leading
 * candidate but is NOT production-approved, and no Satoshi files exist in this
 * repository. Because components reference the role and never a family name, adopting
 * Satoshi later is a change to this one value.
 *
 * `numeric` carries the approved Inter role. The normative requirement is the rendering
 * outcome — tabular and lining figures wherever alignment requires it — not any
 * particular font build.
 */
export const font = {
  brand: {
    family: 'system' as const,
    /** Per-platform stacks; consumers pick the one that applies. */
    webStack:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  numeric: {
    family: 'Inter' as const,
    /** Falls back to the platform face, which also supports tabular figures. */
    webStack:
      'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    /** Financial numerics must retain tabular alignment, including in fallback. */
    tabular: true as const,
  },
} as const;

export const tokens = { color, interaction, space, radius, font } as const;

export type Tokens = typeof tokens;
export type ColorTokens = typeof color;
