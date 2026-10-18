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

export type IconName =
  | 'home'
  | 'market'
  | 'history'
  | 'cards'
  | 'profile'
  | 'bell'
  | 'help'
  | 'swap'
  | 'more'
  | 'sort'
  | 'back'
  | 'info'
  | 'caret'
  | 'megaphone'
  | 'people'
  | 'idcard'
  | 'lock'
  | 'faq'
  | 'headset'
  | 'gift'
  | 'document'
  | 'moon'
  | 'chevron'
  | 'phone'
  | 'mail'
  | 'calendar'
  | 'gender'
  | 'search'
  | 'trash'
  | 'plus'
  | 'globe'
  | 'check'
  | 'key'
  | 'copy'
  | 'hexagon'
  | 'dollar'
  | 'minus'
  | 'close'
  | 'camera'
  | 'pencil'
  | 'scan';

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

      {name === 'help' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...stroke} />
          <Path d="M9.75 9.5a2.25 2.25 0 1 1 3.4 1.95c-.7.4-1.15.95-1.15 1.8v.25" {...stroke} />
          <Path d="M12 16.75h.01" {...stroke} />
        </>
      ) : null}

      {name === 'swap' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...stroke} />
          <Path d="M8 10.5h7.5l-2-2M16 13.5H8.5l2 2" {...stroke} />
        </>
      ) : null}

      {name === 'more' ? (
        <>
          <Circle cx={12} cy={6} r={1.6} fill={color} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
          <Circle cx={12} cy={18} r={1.6} fill={color} />
        </>
      ) : null}

      {name === 'sort' ? (
        <Path d="M7 4v15M4 16l3 3 3-3M13 6h8M13 10.5h6M13 15h4M13 19.5h2" {...stroke} />
      ) : null}

      {name === 'back' ? <Path d="M20 12H4M10 6l-6 6 6 6" {...stroke} /> : null}

      {name === 'info' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...stroke} />
          <Path d="M12 11v5.5M12 7.75h.01" {...stroke} />
        </>
      ) : null}

      {name === 'caret' ? <Path d="M6 9.5h12L12 16z" fill={color} /> : null}

      {name === 'megaphone' ? (
        <>
          <Path d="M4 10v4h3l8 4.5v-13L7 10z" {...stroke} />
          <Path d="M7 14l1.5 5h2.5L10 14M18 9a4 4 0 0 1 0 6" {...stroke} />
        </>
      ) : null}

      {name === 'people' ? (
        <>
          <Circle cx={9} cy={8} r={3} {...stroke} />
          <Path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.5a3 3 0 0 1 0 5.5M17 14a5.5 5.5 0 0 1 3.5 5" {...stroke} />
        </>
      ) : null}
      {name === 'idcard' ? (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={2} {...stroke} />
          <Circle cx={9} cy={11} r={2} {...stroke} />
          <Path d="M6 16a3 3 0 0 1 6 0M14.5 10h4M14.5 13.5h3" {...stroke} />
        </>
      ) : null}
      {name === 'lock' ? (
        <>
          <Rect x={5} y={10.5} width={14} height={10} rx={2} {...stroke} />
          <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" {...stroke} />
        </>
      ) : null}
      {name === 'faq' ? (
        <>
          <Path d="M4 5.5h16v10H10l-4 3.5v-3.5H4z" {...stroke} />
          <Path d="M10.25 8.75a1.75 1.75 0 1 1 2.6 1.5c-.5.3-.85.7-.85 1.3M12 13.4h.01" {...stroke} />
        </>
      ) : null}
      {name === 'headset' ? (
        <>
          <Path d="M5 14v-2a7 7 0 0 1 14 0v2" {...stroke} />
          <Rect x={3.5} y={13} width={3.5} height={5.5} rx={1.2} {...stroke} />
          <Rect x={17} y={13} width={3.5} height={5.5} rx={1.2} {...stroke} />
          <Path d="M19 18.5c0 1.7-1.5 2.5-4 2.5h-2" {...stroke} />
        </>
      ) : null}
      {name === 'gift' ? (
        <>
          <Rect x={4} y={9.5} width={16} height={4} rx={1} {...stroke} />
          <Path d="M5.5 13.5V20h13v-6.5M12 9.5V20M12 9.5S10.5 5 8.5 5.5 9 9.5 12 9.5zM12 9.5S13.5 5 15.5 5.5 15 9.5 12 9.5z" {...stroke} />
        </>
      ) : null}
      {name === 'document' ? (
        <>
          <Path d="M7 3.5h7l4 4V20.5H7z" {...stroke} />
          <Path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6" {...stroke} />
        </>
      ) : null}
      {name === 'moon' ? <Path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z" {...stroke} /> : null}
      {name === 'chevron' ? <Path d="M9.5 6l6 6-6 6" {...stroke} /> : null}
      {name === 'phone' ? (
        <Path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3A2 2 0 0 1 18 20 14 14 0 0 1 4.5 6.5 2 2 0 0 1 6.5 4z" {...stroke} />
      ) : null}
      {name === 'mail' ? (
        <>
          <Rect x={3.5} y={6} width={17} height={12} rx={1.5} {...stroke} />
          <Path d="M4 7l8 6 8-6" {...stroke} />
        </>
      ) : null}
      {name === 'calendar' ? (
        <>
          <Rect x={3.5} y={5} width={17} height={15} rx={2} {...stroke} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...stroke} />
        </>
      ) : null}
      {name === 'gender' ? (
        <>
          <Circle cx={10} cy={14} r={4.5} {...stroke} />
          <Path d="M13.2 10.8 19 5M15 5h4v4" {...stroke} />
        </>
      ) : null}
      {name === 'search' ? (
        <>
          <Circle cx={11} cy={11} r={6.5} {...stroke} />
          <Path d="M16 16l4 4" {...stroke} />
        </>
      ) : null}
      {name === 'trash' ? (
        <Path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6" {...stroke} />
      ) : null}
      {name === 'check' ? <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} /> : null}
      {name === 'key' ? (
        <>
          <Circle cx={8} cy={14} r={4} {...stroke} />
          <Path d="M11 11l8-8M16 6l2.5 2.5M14 8l2 2" {...stroke} />
        </>
      ) : null}
      {name === 'copy' ? (
        <>
          <Path d="M9 9h10v11H9z" {...stroke} />
          <Path d="M5 15V4h10" {...stroke} />
        </>
      ) : null}
      {name === 'hexagon' ? (
        <>
          <Path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" {...stroke} />
          <Circle cx={12} cy={12} r={3} {...stroke} />
        </>
      ) : null}
      {name === 'dollar' ? (
        <>
          <Path d="M4 5h16v14H4z" {...stroke} />
          <Path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.9 0 2.6 5 1.4 5 4.1 0 1.2-1.1 2-2.5 2-1.2 0-2.2-.5-2.7-1.3M12 6.5v11" {...stroke} />
        </>
      ) : null}
      {name === 'camera' ? (
        <>
          <Path d="M3 7.5h4l2-2.5h6l2 2.5h4V19H3z" {...stroke} />
          <Circle cx={12} cy={13} r={3.5} {...stroke} />
        </>
      ) : null}
      {name === 'pencil' ? <Path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5zM13.5 7l3 3" {...stroke} /> : null}
      {name === 'scan' ? (
        <>
          <Path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16" {...stroke} />
          <Path d="M9 10v1M15 10v1M12 10v3h-1M9.5 15.5c1.4 1 3.6 1 5 0" {...stroke} />
        </>
      ) : null}
      {name === 'minus' ? <Path d="M5 12h14" {...stroke} /> : null}
      {name === 'close' ? <Path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6" {...stroke} /> : null}
      {name === 'plus' ? <Path d="M12 5v14M5 12h14" {...stroke} /> : null}
      {name === 'globe' ? (
        <>
          <Circle cx={12} cy={12} r={8.5} {...stroke} />
          <Path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" {...stroke} />
        </>
      ) : null}
    </Svg>
  );
}
