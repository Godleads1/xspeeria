/**
 * Admin theme.
 *
 * The same semantic tokens as mobile — one Xspeeria brand — with a denser spacing
 * scale. Density is the approved axis of difference; colour, status meaning and
 * financial number formatting are shared.
 */

import { color, font, interaction, radius, space } from '@xspeeria/tokens';

export { color, interaction, radius, space };

/** Operator console: tighter than mobile, same 8pt basis. */
export const density = {
  rowHeight: 40,
  cellPaddingX: 12,
  cellPaddingY: 8,
  sectionGap: 16,
} as const;

export const fontStack = {
  brand: font.brand.webStack,
  numeric: font.numeric.webStack,
} as const;

/**
 * Applied only to numeric cells. Financial numerics must retain tabular alignment,
 * which `font-variant-numeric` delivers natively on the web.
 */
export const numericStyle = {
  fontFamily: fontStack.numeric,
  fontVariantNumeric: 'tabular-nums lining-nums',
} as const;
