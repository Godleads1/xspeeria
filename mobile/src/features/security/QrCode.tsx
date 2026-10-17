/** QR code drawn with react-native-svg from the `qrcode` matrix (no extra native code). */

import { useMemo, type ReactElement } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';

export function QrCode({ value, size = 184, testID }: { value: string; size?: number; testID?: string }): ReactElement {
  const { path, count } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    let d = '';
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path: d, count: modules.size };
  }, [value]);
  const quiet = 2;
  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`}
      accessibilityLabel="QR code for your authenticator app"
      accessibilityRole="image"
    >
      <Rect x={-quiet} y={-quiet} width={count + quiet * 2} height={count + quiet * 2} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
