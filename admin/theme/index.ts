/**
 * Admin theme.
 *
 * The same semantic tokens as mobile — one Xspeeria brand — with a denser spacing
 * scale. Density is the approved axis of difference; colour, status meaning and
 * financial number formatting are shared.
 *
 * Dark mode (owner request 2026-10-26, ADR-064): every colour the console uses is a CSS
 * variable. Light values are `color` and dark values are `colorDark` from `@xspeeria/tokens`
 * (DEC-016, the same approved dark scheme as the app). `themeCss()` writes both sets; the
 * page picks one with `data-theme` on <html> (Light / Dark / System, see lib/theme.ts).
 * Components keep writing `color.text.primary` etc. — they get `var(--xs-text-primary)`.
 */

import {
  type ColorScheme,
  color as light,
  colorDark as darkTokens,
  font,
  interaction as lightInteraction,
  interactionDark,
  radius,
  space,
} from '@xspeeria/tokens';

export { radius, space };

type Scheme = ColorScheme;
type Vars<T> = { readonly [K in keyof T]: T[K] extends string ? string : Vars<T[K]> };

function vars<T extends object>(source: T, prefix: string): Vars<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) {
    out[k] = typeof v === 'string' ? `var(--xs-${prefix}${k})` : vars(v as object, `${prefix}${k}-`);
  }
  return out as Vars<T>;
}

function flatten(source: object, prefix: string, into: Record<string, string>): Record<string, string> {
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === 'string') into[`--xs-${prefix}${k}`] = v;
    else flatten(v as object, `${prefix}${k}-`, into);
  }
  return into;
}

/**
 * Admin-only colours (page background, chart series, tile tints, trend and timer colours,
 * shadows). Chart pairs were checked with the dataviz validator against each mode's surface:
 * light #4A5BD0 / #D98A1F on white, dark #6F82F2 / #C2802A on #151B2C — all checks pass.
 */
/** Keeps the key names (typos fail to compile) while allowing any colour string. */
function palette<T extends Record<string, string>>(o: T): { readonly [K in keyof T]: string } {
  return o;
}

const adminLight = palette({
  page: '#F5F6FA',
  card: light.bg.canvas,
  hover: 'rgba(74, 91, 208, 0.06)',
  shadow: 'rgba(15, 23, 42, 0.08)',
  scrim: 'rgba(15, 23, 42, 0.35)',
  series1: '#4A5BD0',
  series2: '#D98A1F',
  track: '#E2E4EA',
  up: '#047857',
  down: '#B91C1C',
  amber: '#B45309',
  tintBlue: '#E3E8FF',
  tintBlueFg: '#4A5BD0',
  tintGreen: '#D9F7E8',
  tintGreenFg: '#1F9D63',
  tintOrange: '#FFE4DA',
  tintOrangeFg: '#E0703F',
  tintGrey: '#E6E7EA',
  tintGreyFg: '#5E6470',
  bubbleStaff: '#E3E8FF',
  bubbleUser: '#F2F3F6',
  glass: 'rgba(235, 241, 255, 0.86)',
  field: 'rgba(255, 255, 255, 0.35)',
  banner: '#0A1A8C',
  rowAlt: '#F8F9FB',
  tile: '#FAFAFB',
  // Navy sidebar with the logo-green active item (white on #1A7A32 is 5.4:1; the green on the
  // navy 3.1:1, enough for a UI shape). Sidebar text on navy 11.1:1.
  side: '#0A1A4A',
  sideText: '#C9D3EE',
  sideActive: '#1A7A32',
  sideLine: 'rgba(255, 255, 255, 0.12)',
  sideDanger: '#FCA5A5',
  heroFrom: '#E8F7EF',
  heroTo: '#EAF0FF',
  greet: '#1A7A32',
});

const adminDark: Record<keyof typeof adminLight, string> = {
  page: darkTokens.bg.canvas,
  // Cards sit one step lighter than the page, as in the app's dark scheme.
  card: darkTokens.bg.sunken,
  hover: 'rgba(142, 162, 255, 0.10)',
  shadow: 'rgba(0, 0, 0, 0.45)',
  scrim: 'rgba(0, 0, 0, 0.6)',
  series1: '#6F82F2',
  series2: '#C2802A',
  track: '#2A3350',
  up: '#6EE7B7',
  down: '#FCA5A5',
  amber: '#FBBF24',
  tintBlue: '#26315C',
  tintBlueFg: '#A5B4FC',
  tintGreen: '#12352A',
  tintGreenFg: '#6EE7B7',
  tintOrange: '#3B2418',
  tintOrangeFg: '#FDBA74',
  tintGrey: '#262E44',
  tintGreyFg: '#CBD5E1',
  bubbleStaff: '#26315C',
  bubbleUser: '#1F2740',
  glass: 'rgba(21, 27, 44, 0.86)',
  field: 'rgba(11, 16, 32, 0.45)',
  banner: '#0A1A8C',
  rowAlt: '#1A2133',
  tile: '#1A2133',
  side: '#070D1F',
  sideText: '#A9B8E3',
  sideActive: '#1A7A32',
  sideLine: 'rgba(255, 255, 255, 0.08)',
  sideDanger: '#FCA5A5',
  heroFrom: '#10243A',
  heroTo: '#18204A',
  greet: '#6EE7B7',
};

/** In the console, white surfaces (cards, panels, inputs) use `bg.canvas`: one step up in dark. */
const darkForConsole: Scheme = {
  ...darkTokens,
  bg: { ...darkTokens.bg, canvas: darkTokens.bg.sunken, sunken: darkTokens.bg.inverse },
};

export const color = vars(light, '') as unknown as Vars<Scheme>;
export const admin = vars(adminLight, 'admin-');
export const interaction = vars(lightInteraction, 'interaction-');

/** The CSS for both schemes. Dark applies with `data-theme="dark"` on <html>. */
export function themeCss(): string {
  const block = (o: Record<string, string>) =>
    Object.entries(o)
      .map(([k, v]) => `${k}:${v};`)
      .join('');
  const lightVars = {
    ...flatten(light, '', {}),
    ...flatten(adminLight, 'admin-', {}),
    ...flatten(lightInteraction, 'interaction-', {}),
  };
  const darkVars = {
    ...flatten(darkForConsole, '', {}),
    ...flatten(adminDark, 'admin-', {}),
    ...flatten(interactionDark, 'interaction-', {}),
  };
  return (
    `:root{${block(lightVars)}color-scheme:light;}` +
    `:root[data-theme="dark"]{${block(darkVars)}color-scheme:dark;}` +
    // Open dropdown lists: Windows draws them on white when the box is see-through, while the
    // text follows the theme, so in dark mode the options were white on white until hovered
    // (owner, 2026-10-27). Give every option the theme's own surface and text colours.
    `select option,select optgroup{background-color:${color.bg.canvas};color:${color.text.primary};}` +
    // The logo has a light-mode and a dark-mode file; show the one for the current theme.
    `:root[data-theme="dark"] .xs-on-light{display:none!important}` +
    `:root:not([data-theme="dark"]) .xs-on-dark{display:none!important}` +
    // Typing caret and gentle entrance for dashboard cards; both off with "reduce motion".
    `@keyframes xs-blink{50%{opacity:0}}.xs-caret{animation:xs-blink 1s steps(1) infinite}` +
    `@keyframes xs-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}` +
    `.xs-rise{animation:xs-rise .5s ease both}` +
    `@media (prefers-reduced-motion: reduce){.xs-caret,.xs-rise{animation:none}}`
  );
}

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
