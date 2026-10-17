/**
 * Round currency flags, as drawn in the Figma frames (History 342:6121, Market, receipt).
 *
 * Simplified vector flags clipped to a circle. Decorative: every use also shows the
 * currency code in text, so the flag never carries meaning on its own. Flag colours are
 * national-flag artwork, not UI tokens, so they live here rather than in the token layer.
 */

import type { ReactElement } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

const FLAG = {
  green: '#008751',
  white: '#FFFFFF',
  red: '#D80027',
  blue: '#0052B4',
  navy: '#012169',
  euBlue: '#003399',
  gold: '#FFCC00',
} as const;

function UsStripes(): ReactElement {
  return (
    <>
      <Rect width={24} height={24} fill={FLAG.white} />
      {Array.from({ length: 7 }, (_, i) => (
        <Rect key={i} y={i * 3.43} width={24} height={1.72} fill={FLAG.red} />
      ))}
      <Rect width={11} height={12} fill={FLAG.blue} />
      {[2, 5, 8].map((x) => [2.5, 6, 9.5].map((y) => <Circle key={`${x}-${y}`} cx={x + 0.5} cy={y} r={0.7} fill={FLAG.white} />))}
    </>
  );
}

function art(code: string): ReactElement {
  switch (code) {
    case 'NGN':
      return (
        <>
          <Rect width={24} height={24} fill={FLAG.white} />
          <Rect width={8} height={24} fill={FLAG.green} />
          <Rect x={16} width={8} height={24} fill={FLAG.green} />
        </>
      );
    case 'USD':
      return <UsStripes />;
    case 'CAD':
      return (
        <>
          <Rect width={24} height={24} fill={FLAG.white} />
          <Rect width={6} height={24} fill={FLAG.red} />
          <Rect x={18} width={6} height={24} fill={FLAG.red} />
          <Path
            d="M12 6l1 2.2 1.6-.6-.5 2.8 1.6-1-.3 1.4 1.6.4-1.4 1.4.4 1.2-2.6-.4.1 2.6h-1l.1-2.6-2.6.4.4-1.2-1.4-1.4 1.6-.4-.3-1.4 1.6 1-.5-2.8 1.6.6z"
            fill={FLAG.red}
          />
        </>
      );
    case 'EUR':
      return (
        <>
          <Rect width={24} height={24} fill={FLAG.euBlue} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <Circle key={i} cx={12 + 6.5 * Math.cos(a)} cy={12 + 6.5 * Math.sin(a)} r={0.95} fill={FLAG.gold} />;
          })}
        </>
      );
    case 'AUD':
      return (
        <>
          <Rect width={24} height={24} fill={FLAG.navy} />
          <Path d="M0 0l12 12M12 0L0 12" stroke={FLAG.white} strokeWidth={2.4} />
          <Path d="M0 0l12 12M12 0L0 12" stroke={FLAG.red} strokeWidth={0.9} />
          <Path d="M6 0v12M0 6h12" stroke={FLAG.white} strokeWidth={3.2} />
          <Path d="M6 0v12M0 6h12" stroke={FLAG.red} strokeWidth={1.6} />
          {[[6, 18, 1.4], [17, 7, 0.9], [20, 12, 0.9], [17, 18, 0.9], [14, 13, 0.6]].map(([x, y, r]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={FLAG.white} />
          ))}
        </>
      );
    default:
      return <Rect width={24} height={24} fill="#9CA3AF" />;
  }
}

export function RoundFlag({ code, size = 24 }: { code: string; size?: number }): ReactElement {
  const id = `flag-${code}`;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`flag-${code}`}
    >
      <Defs>
        <ClipPath id={id}>
          <Circle cx={12} cy={12} r={12} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>{art(code)}</G>
      <Circle cx={12} cy={12} r={11.6} fill="none" stroke="#000000" strokeOpacity={0.08} strokeWidth={0.8} />
    </Svg>
  );
}
