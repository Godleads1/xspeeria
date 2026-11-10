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
  etGreen: '#078930',
  etYellow: '#FCDD09',
  etRed: '#DA121A',
  etBlue: '#0F47AF',
  ghRed: '#CE1126',
  ghGold: '#FCD116',
  ghGreen: '#006B3F',
  black: '#000000',
  deRed: '#DD0000',
  deGold: '#FFCE00',
  frBlue: '#002395',
  frRed: '#ED2939',
  cnRed: '#EE1C25',
  cnYellow: '#FFFF00',
  // ADR-107: simplified African flags (a 24-px round badge, not a full flag).
  afGreen: '#009A44',
  afRed: '#CE1126',
  afYellow: '#FCD116',
  afBlue: '#0F47AF',
  zaBlue: '#002395',
  zaGreen: '#007A4D',
  zaGold: '#FFB612',
  zmOrange: '#EF7D00',
  tzBlue: '#00A3DD',
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
    case 'GBP':
      return (
        <>
          <Rect width={24} height={24} fill={FLAG.navy} />
          <Path d="M0 0l24 24M24 0L0 24" stroke={FLAG.white} strokeWidth={4.5} />
          <Path d="M0 0l24 24M24 0L0 24" stroke={FLAG.red} strokeWidth={1.6} />
          <Path d="M12 0v24M0 12h24" stroke={FLAG.white} strokeWidth={7} />
          <Path d="M12 0v24M0 12h24" stroke={FLAG.red} strokeWidth={4} />
        </>
      );
    case 'ETB':
      return (
        <>
          <Rect width={24} height={8} fill={FLAG.etGreen} />
          <Rect y={8} width={24} height={8} fill={FLAG.etYellow} />
          <Rect y={16} width={24} height={8} fill={FLAG.etRed} />
          <Circle cx={12} cy={12} r={5} fill={FLAG.etBlue} />
          <Path d="M12 8.6l.9 2.6h2.6l-2.1 1.6.8 2.6-2.2-1.6-2.2 1.6.8-2.6-2.1-1.6h2.6z" fill={FLAG.etYellow} />
        </>
      );
    case 'GHS':
      return (
        <>
          <Rect width={24} height={8} fill={FLAG.ghRed} />
          <Rect y={8} width={24} height={8} fill={FLAG.ghGold} />
          <Rect y={16} width={24} height={8} fill={FLAG.ghGreen} />
          <Path d="M12 8.4l.95 2.9h3.05l-2.45 1.8.95 2.9L12 14.2 9.5 16l.95-2.9L8 11.3h3.05z" fill={FLAG.black} />
        </>
      );
    // ADR-105: Germany and France (both pay euros) and China (yuan).
    case 'DE':
      return (
        <>
          <Rect width={24} height={8} fill={FLAG.black} />
          <Rect y={8} width={24} height={8} fill={FLAG.deRed} />
          <Rect y={16} width={24} height={8} fill={FLAG.deGold} />
        </>
      );
    case 'FR':
      return (
        <>
          <Rect width={8} height={24} fill={FLAG.frBlue} />
          <Rect x={8} width={8} height={24} fill={FLAG.white} />
          <Rect x={16} width={8} height={24} fill={FLAG.frRed} />
        </>
      );
    case 'CNY':
      return (
        <>
          <Rect width={24} height={24} fill={FLAG.cnRed} />
          <Path d="M7 4.5l1.1 3.3h3.5l-2.8 2 1.1 3.3L7 11.1l-2.9 2 1.1-3.3-2.8-2h3.5z" fill={FLAG.cnYellow} />
          {[[13, 4], [15, 6.5], [15, 10], [13, 12.5]].map(([x, y]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={0.9} fill={FLAG.cnYellow} />
          ))}
        </>
      );
    case 'EGP':
    case 'EG':
      return (
        <>
          <Rect width={24} height={8} fill={FLAG.afRed} />
          <Rect y={8} width={24} height={8} fill={FLAG.white} />
          <Rect y={16} width={24} height={8} fill={FLAG.black} />
        </>
      );
    case 'ZAR':
    case 'ZA':
      return (
        <>
          <Rect width={24} height={12} fill={FLAG.afRed} />
          <Rect y={12} width={24} height={12} fill={FLAG.zaBlue} />
          <Path d="M0 0 L12 9 H24 V15 H12 L0 24 Z" fill={FLAG.white} />
          <Path d="M0 2.5 L10.5 10 H24 V14 H10.5 L0 21.5 Z" fill={FLAG.zaGreen} />
          <Path d="M0 5.5 L8.5 12 L0 18.5 Z" fill={FLAG.zaGold} />
          <Path d="M0 7.5 L6 12 L0 16.5 Z" fill={FLAG.black} />
        </>
      );
    case 'MAD':
    case 'MA':
      return (
        <>
          <Rect width={24} height={24} fill={FLAG.afRed} />
          <Path d="M12 6.5l1.6 4.9h5.1l-4.1 3 1.6 4.9-4.2-3-4.2 3 1.6-4.9-4.1-3h5.1z" fill="none" stroke={FLAG.afGreen} strokeWidth={1.1} />
        </>
      );
    case 'ET':
      return (
        <>
          <Rect width={24} height={8} fill={FLAG.afGreen} />
          <Rect y={8} width={24} height={8} fill={FLAG.afYellow} />
          <Rect y={16} width={24} height={8} fill={FLAG.afRed} />
          <Circle cx={12} cy={12} r={5} fill={FLAG.afBlue} />
        </>
      );
    case 'KES':
    case 'KE':
      return (
        <>
          <Rect width={24} height={8} fill={FLAG.black} />
          <Rect y={8} width={24} height={8} fill={FLAG.white} />
          <Rect y={9.2} width={24} height={5.6} fill={FLAG.afRed} />
          <Rect y={16} width={24} height={8} fill={FLAG.afGreen} />
          <Path d="M12 4.5 C15 8 15 16 12 19.5 C9 16 9 8 12 4.5 Z" fill={FLAG.afRed} stroke={FLAG.black} strokeWidth={0.6} />
        </>
      );
  // West African CFA franc: Senegal is the Xspeeria corridor (ADR-107).
    case 'XOF':
    case 'SN':
      return (
        <>
          <Rect width={8} height={24} fill={FLAG.afGreen} />
          <Rect x={8} width={8} height={24} fill={FLAG.afYellow} />
          <Rect x={16} width={8} height={24} fill={FLAG.afRed} />
          <Circle cx={12} cy={12} r={2.2} fill={FLAG.afGreen} />
        </>
      );
    case 'GH':
      return (
        <>
          <Rect width={24} height={8} fill={FLAG.afRed} />
          <Rect y={8} width={24} height={8} fill={FLAG.afYellow} />
          <Rect y={16} width={24} height={8} fill={FLAG.afGreen} />
          <Path d="M12 8.6l1 3h3.2l-2.6 1.9 1 3-2.6-1.9-2.6 1.9 1-3-2.6-1.9H11z" fill={FLAG.black} />
        </>
      );
    case 'ZW':
      return (
        <>
          {[FLAG.afGreen, FLAG.afYellow, FLAG.afRed, FLAG.black, FLAG.afRed, FLAG.afYellow, FLAG.afGreen].map((c, i) => (
            <Rect key={i} y={(24 / 7) * i} width={24} height={24 / 7 + 0.1} fill={c} />
          ))}
          <Path d="M0 0 L11 12 L0 24 Z" fill={FLAG.white} stroke={FLAG.black} strokeWidth={0.6} />
        </>
      );
    case 'UGX':
    case 'UG':
      return (
        <>
          {[FLAG.black, FLAG.afYellow, FLAG.afRed, FLAG.black, FLAG.afYellow, FLAG.afRed].map((c, i) => (
            <Rect key={i} y={4 * i} width={24} height={4} fill={c} />
          ))}
          <Circle cx={12} cy={12} r={4} fill={FLAG.white} />
        </>
      );
    case 'ZMW':
    case 'ZM':
      return (
        <>
          <Rect width={24} height={24} fill={FLAG.afGreen} />
          <Rect x={13.5} y={10} width={3.5} height={14} fill={FLAG.afRed} />
          <Rect x={17} y={10} width={3.5} height={14} fill={FLAG.black} />
          <Rect x={20.5} y={10} width={3.5} height={14} fill={FLAG.zmOrange} />
        </>
      );
    case 'TZS':
    case 'TZ':
      return (
        <>
          <Path d="M0 0 H24 L0 24 Z" fill={FLAG.afGreen} />
          <Path d="M24 0 V24 H0 Z" fill={FLAG.tzBlue} />
          <Path d="M0 24 L24 0" stroke={FLAG.afYellow} strokeWidth={8} />
          <Path d="M0 24 L24 0" stroke={FLAG.black} strokeWidth={5} />
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
