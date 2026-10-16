/**
 * Icon set.
 *
 * Drawn with `react-native-svg` (DEC-005, 2026-10-16) to match the Figma mobile
 * navigation (file 5ayAjPFxxHmEQIrEjauHTB, page 1:2): an outline glyph when inactive and
 * a solid glyph when active. The Figma vectors could not be exported (no edit access to
 * the file), so the paths below are redrawn on a 24pt box against the Figma renders.
 * Swap in the exported vectors once they are available; the public API stays the same.
 *
 * Colour is always supplied by the caller from the semantic token layer; no icon names a
 * colour itself. `knockout` is the surface the icon sits on: a solid glyph cuts its inner
 * details (door, receipt lines, card stripe) in that colour.
 */

import type { ReactElement } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName = 'home' | 'market' | 'history' | 'cards' | 'profile' | 'bell';

/** Reference box the geometry below is authored against. */
const BOX = 24;

export function Icon({
  name,
  color,
  size = BOX,
  weight = 1.75,
  filled = false,
  knockout = 'transparent',
}: {
  name: IconName;
  color: ColorValue;
  size?: number;
  /** Stroke weight of the outline glyph. */
  weight?: number;
  /** Solid glyph: the active navigation state. */
  filled?: boolean;
  /** Surface colour used for inner details of a solid glyph. */
  knockout?: ColorValue;
}): ReactElement {
  const stroke = {
    stroke: color,
    strokeWidth: weight,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const solid = { fill: color, stroke: color, strokeWidth: weight, strokeLinejoin: 'round' as const };
  const cut = {
    stroke: knockout,
    strokeWidth: weight,
    strokeLinecap: 'round' as const,
    fill: 'none',
  };
  const body = filled ? solid : stroke;
  const detail = filled ? cut : stroke;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} testID={`icon-${name}`}>
      {name === 'home' ? (
        <>
          <Path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" {...body} />
          <Path d="M10 16.25h4" {...detail} />
        </>
      ) : null}

      {name === 'market' ? (
        <>
          <Path
            d="M5 4h14l1.75 4.75a2.6 2.6 0 0 1-4.6 1.75 2.9 2.9 0 0 1-4.15.6 2.9 2.9 0 0 1-4.15-.6 2.6 2.6 0 0 1-4.6-1.75z"
            {...body}
          />
          {filled ? (
            <Path d="M5.25 13h13.5v7.5h-4.5V16h-4.5v4.5h-4.5z" {...solid} />
          ) : (
            <Path d="M5.25 13v7.5h13.5V13M10 20.5V16h4v4.5" {...stroke} />
          )}
          <Path d="M9.5 4.25 9 10.5M14.5 4.25l.5 6.25" {...detail} />
        </>
      ) : null}

      {name === 'history' ? (
        <>
          <Path
            d="M6 3.5h12v17l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25z"
            {...body}
          />
          <Path d="M9 8h6M9 11.5h6M9 15h3.5" {...detail} />
        </>
      ) : null}

      {name === 'cards' ? (
        <>
          <Rect x={3} y={5.5} width={18} height={13} rx={2.5} {...body} />
          <Path d="M3 10h18M6.5 14.5h4" {...detail} />
        </>
      ) : null}

      {name === 'profile' ? (
        <>
          <Circle cx={12} cy={8.5} r={3.5} {...body} />
          <Path d="M5 20a7 7 0 0 1 14 0z" {...body} />
        </>
      ) : null}

      {name === 'bell' ? (
        <>
          <Path d="M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z" {...stroke} />
          <Path d="M10.25 20.5h3.5" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}
