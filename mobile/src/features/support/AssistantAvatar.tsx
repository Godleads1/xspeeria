/** Original avatar for the "Alex" assistant (Figma shows an illustrated face). Decorative. */

import type { ReactElement } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';

export function AssistantAvatar({ size = 40 }: { size?: number }): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <ClipPath id="aa-clip">
          <Circle cx={20} cy={20} r={20} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#aa-clip)">
        <Circle cx={20} cy={20} r={20} fill="#BFE3F5" />
        <Path d="M6 42c0-8 6-12 14-12s14 4 14 12z" fill="#2563EB" />
        <Path d="M10 22c-1-9 4-14 10-14s11 5 10 14l-2 6H12z" fill="#3B2A22" />
        <Ellipse cx={20} cy={20} rx={7} ry={8} fill="#F2C3A0" />
        <Path d="M13 17c2-5 9-6 14-1-4 0-8-1-14 1z" fill="#3B2A22" />
        <Circle cx={17.2} cy={20} r={0.9} fill="#1F2937" />
        <Circle cx={22.8} cy={20} r={0.9} fill="#1F2937" />
        <Path d="M18 24c1.2.8 2.8.8 4 0" stroke="#B4533A" strokeWidth={0.9} strokeLinecap="round" fill="none" />
      </G>
    </Svg>
  );
}
