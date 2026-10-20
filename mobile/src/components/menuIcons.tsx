/**
 * Colourful "3D-style" menu icons for Profile (ADR-007), original artwork drawn in the
 * spirit of the Figma set: soft gradients, a light highlight and a small ground shadow.
 * Decorative: every row also has a text title, so icons carry no meaning on their own.
 * Illustration colours live here (like flags.tsx), not in the token layer.
 */

import type { ReactElement } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export type MenuIconName =
  | 'beneficiaries'
  | 'kyc'
  | 'security'
  | 'faq'
  | 'support'
  | 'referral'
  | 'terms'
  | 'mode'
  | 'language';

const C = {
  navy: '#1E3A8A',
  navyLight: '#3B5BDB',
  sky: '#38BDF8',
  skyLight: '#7DD3FC',
  gold: '#F59E0B',
  goldLight: '#FCD34D',
  green: '#10B981',
  greenLight: '#6EE7B7',
  coral: '#F43F5E',
  coralLight: '#FDA4AF',
  violet: '#7C3AED',
  violetLight: '#C4B5FD',
  skin: '#F5C09A',
  white: '#FFFFFF',
  paper: '#F8FAFC',
  line: '#CBD5E1',
  shadow: '#0F172A',
} as const;

function Grad({ id, from, to }: { id: string; from: string; to: string }): ReactElement {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor={from} />
      <Stop offset="1" stopColor={to} />
    </LinearGradient>
  );
}

function Ground(): ReactElement {
  return <Ellipse cx={12} cy={22.4} rx={7} ry={1.1} fill={C.shadow} fillOpacity={0.12} />;
}

function art(name: MenuIconName, p: string): ReactElement {
  const g = (k: string): string => `url(#${p}-${k})`;
  switch (name) {
    case 'beneficiaries':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.skyLight} to={C.sky} />
            <Grad id={`${p}-b`} from={C.navyLight} to={C.navy} />
          </Defs>
          <Ground />
          <Circle cx={16.5} cy={7.5} r={2.8} fill={C.skin} />
          <Path d="M11.5 18.5c0-3.4 2.2-5.6 5-5.6s5 2.2 5 5.6v1H11.5z" fill={g('a')} />
          <Circle cx={9} cy={8} r={3.4} fill={C.skin} />
          <Path d="M2.5 20c0-4 2.9-6.6 6.5-6.6s6.5 2.6 6.5 6.6v.6h-13z" fill={g('b')} />
          <Path d="M5 15.6c1-.9 2.3-1.4 4-1.4" stroke={C.white} strokeOpacity={0.5} strokeWidth={1} strokeLinecap="round" fill="none" />
        </>
      );
    case 'kyc':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.paper} to="#E2E8F0" />
            <Grad id={`${p}-b`} from={C.goldLight} to={C.gold} />
          </Defs>
          <Ground />
          <Rect x={2.5} y={4} width={15} height={11} rx={2} fill={g('a')} stroke={C.line} strokeWidth={0.6} />
          <Rect x={2.5} y={4} width={15} height={2.6} rx={1.2} fill={C.navyLight} />
          <Circle cx={6.6} cy={10.4} r={2} fill={C.skin} />
          <Path d="M8.8 9.6h6M8.8 11.6h4.2" stroke={C.line} strokeWidth={1.1} strokeLinecap="round" />
          <Ellipse cx={17} cy={19.6} rx={4.2} ry={1.5} fill={C.gold} />
          <Rect x={12.8} y={16.6} width={8.4} height={3} fill={C.gold} />
          <Ellipse cx={17} cy={16.6} rx={4.2} ry={1.5} fill={g('b')} />
          <Ellipse cx={17} cy={14.4} rx={4.2} ry={1.5} fill={C.gold} />
          <Rect x={12.8} y={13.2} width={8.4} height={1.3} fill={C.gold} />
          <Ellipse cx={17} cy={13.2} rx={4.2} ry={1.5} fill={g('b')} />
        </>
      );
    case 'security':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.greenLight} to={C.green} />
          </Defs>
          <Ground />
          <Path d="M12 2.2l7.5 2.9v5.6c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.1z" fill={g('a')} />
          <Path d="M12 2.2v18.8c-4.3-1.7-7.5-5.3-7.5-10.3V5.1z" fill={C.white} fillOpacity={0.18} />
          <Path d="M8.4 11.6l2.5 2.5 4.8-5" stroke={C.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M6.6 6.4l2.4-.9" stroke={C.white} strokeOpacity={0.7} strokeWidth={1} strokeLinecap="round" />
        </>
      );
    case 'faq':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.navyLight} to={C.navy} />
            <Grad id={`${p}-b`} from={C.goldLight} to={C.gold} />
          </Defs>
          <Ground />
          <Path d="M9.5 9h10a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2h-1v2.6l-3-2.6h-6a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z" fill={g('b')} />
          <Path d="M4.5 3h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.2 2.8V13H4.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill={g('a')} />
          <Path d="M7.8 6.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.5-.7 1" stroke={C.white} strokeWidth={1.3} strokeLinecap="round" fill="none" />
          <Circle cx={9.5} cy={10.6} r={0.75} fill={C.white} />
          <Path d="M12.5 13.7h6M12.5 15.7h4" stroke={C.white} strokeOpacity={0.85} strokeWidth={1.1} strokeLinecap="round" />
        </>
      );
    case 'support':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.navyLight} to={C.navy} />
            <Grad id={`${p}-b`} from={C.skyLight} to={C.sky} />
          </Defs>
          <Ground />
          <Path d="M4.5 12.5a7.5 7.5 0 0 1 15 0" stroke={g('a')} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Rect x={2.8} y={11.5} width={4.4} height={6.6} rx={2} fill={g('b')} />
          <Rect x={16.8} y={11.5} width={4.4} height={6.6} rx={2} fill={g('b')} />
          <Path d="M19 18c0 2-2 3-5 3" stroke={C.navy} strokeWidth={1.3} fill="none" strokeLinecap="round" />
          <Rect x={11.6} y={19.8} width={3.6} height={2.2} rx={1.1} fill={C.navy} />
          <Path d="M3.8 13v3" stroke={C.white} strokeOpacity={0.7} strokeWidth={0.9} strokeLinecap="round" />
        </>
      );
    case 'referral':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.coralLight} to={C.coral} />
            <Grad id={`${p}-b`} from={C.goldLight} to={C.gold} />
          </Defs>
          <Ground />
          <Path d="M12 7.5c-1.5-3.5-5.6-3.6-5.6-1.3 0 1.6 2.6 1.6 5.6 1.3zM12 7.5c1.5-3.5 5.6-3.6 5.6-1.3 0 1.6-2.6 1.6-5.6 1.3z" fill={g('b')} />
          <Rect x={4.5} y={11} width={15} height={10} rx={1.6} fill={g('a')} />
          <Rect x={3.5} y={7.5} width={17} height={4.2} rx={1.4} fill={C.coral} />
          <Rect x={10.6} y={7.5} width={2.8} height={13.5} fill={g('b')} />
          <Path d="M5.5 9h3" stroke={C.white} strokeOpacity={0.6} strokeWidth={1} strokeLinecap="round" />
        </>
      );
    case 'terms':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.violetLight} to={C.violet} />
            <Grad id={`${p}-b`} from={C.white} to={C.paper} />
          </Defs>
          <Ground />
          <Rect x={4} y={3.5} width={16} height={18} rx={2.4} fill={g('a')} />
          <Rect x={6} y={5.8} width={12} height={14} rx={1.2} fill={g('b')} />
          <Rect x={8.5} y={2.2} width={7} height={3.4} rx={1.2} fill={C.navy} />
          <Path d="M8.2 9.6h7.6M8.2 12.2h7.6M8.2 14.8h4.6" stroke={C.line} strokeWidth={1.1} strokeLinecap="round" />
          <Path d="M13.2 17.2l1.4 1.4 2.6-2.8" stroke={C.green} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      );
    case 'mode':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.navyLight} to={C.navy} />
            <Grad id={`${p}-b`} from={C.goldLight} to={C.gold} />
          </Defs>
          <Ground />
          <Circle cx={12} cy={12} r={8.6} fill={g('a')} />
          <Path d="M14.6 6.4a5.8 5.8 0 1 0 3.4 8.8 4.6 4.6 0 1 1-3.4-8.8z" fill={g('b')} />
          <Circle cx={8} cy={8.4} r={0.7} fill={C.white} />
          <Circle cx={6.6} cy={13} r={0.5} fill={C.white} fillOpacity={0.8} />
          <Path d="M6.5 6.2a7 7 0 0 1 3-1.6" stroke={C.white} strokeOpacity={0.45} strokeWidth={1} strokeLinecap="round" fill="none" />
        </>
      );
    case 'language':
      return (
        <>
          <Defs>
            <Grad id={`${p}-a`} from={C.skyLight} to={C.sky} />
          </Defs>
          <Ground />
          <Circle cx={12} cy={12} r={8.6} fill={g('a')} />
          <Path
            d="M3.4 12h17.2M12 3.4c2.4 2.4 3.6 5.3 3.6 8.6S14.4 18.2 12 20.6M12 3.4C9.6 5.8 8.4 8.7 8.4 12s1.2 6.2 3.6 8.6M5 7.6h14M5 16.4h14"
            stroke={C.white}
            strokeWidth={1.1}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
  }
}

export function MenuIcon({ name, size = 28 }: { name: MenuIconName; size?: number }): ReactElement {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`menu-icon-${name}`}
    >
      <G>{art(name, `mi-${name}`)}</G>
    </Svg>
  );
}
