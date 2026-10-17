/**
 * Original referral illustration in the Figma 3D style (ADR-007 A8): a soft white figure,
 * a glossy blue figure in front, and a paper plane between them. Decorative.
 */

import type { ReactElement } from 'react';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

export function ReferralArt({ width = 280 }: { width?: number }): ReactElement {
  const height = (width * 200) / 280;
  return (
    <Svg width={width} height={height} viewBox="0 0 280 200" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="referral-art">
      <Defs>
        <RadialGradient id="ra-white-head" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D5D9E2" />
        </RadialGradient>
        <RadialGradient id="ra-white-body" cx="0.35" cy="0.25" r="0.9">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#CDD2DD" />
        </RadialGradient>
        <RadialGradient id="ra-blue-head" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#4F6BFF" />
          <Stop offset="1" stopColor="#1530B8" />
        </RadialGradient>
        <RadialGradient id="ra-blue-body" cx="0.35" cy="0.25" r="0.9">
          <Stop offset="0" stopColor="#4562FA" />
          <Stop offset="1" stopColor="#0F24A3" />
        </RadialGradient>
        <LinearGradient id="ra-plane" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#C7D2FE" />
          <Stop offset="1" stopColor="#6D7FF0" />
        </LinearGradient>
      </Defs>

      <Ellipse cx={140} cy={188} rx={110} ry={8} fill="#0F172A" fillOpacity={0.06} />

      {/* White figure, behind */}
      <Ellipse cx={96} cy={150} rx={66} ry={36} fill="url(#ra-white-body)" stroke="#E2E8F0" strokeWidth={1} />
      <Circle cx={92} cy={80} r={27} fill="url(#ra-white-head)" stroke="#E2E8F0" strokeWidth={1} />
      <Ellipse cx={82} cy={70} rx={9} ry={6} fill="#FFFFFF" fillOpacity={0.8} />

      {/* Blue figure, front */}
      <Ellipse cx={186} cy={138} rx={74} ry={44} fill="url(#ra-blue-body)" />
      <Circle cx={196} cy={44} r={34} fill="url(#ra-blue-head)" />
      <Ellipse cx={182} cy={30} rx={11} ry={7} fill="#FFFFFF" fillOpacity={0.35} />
      <Ellipse cx={160} cy={112} rx={22} ry={8} fill="#FFFFFF" fillOpacity={0.18} />

      {/* Paper plane */}
      <Path d="M108 162l60-30-34 44-6-14z" fill="url(#ra-plane)" />
      <Path d="M108 162l20 0 40-30z" fill="#E0E7FF" />
      <Path d="M128 162l6 14-2-14z" fill="#4F5FD8" />
    </Svg>
  );
}
