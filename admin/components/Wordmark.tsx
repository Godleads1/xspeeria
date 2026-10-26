/**
 * The Xspeeria logo (the owner's Figma export, `public/xspeeria-logo.svg`, 235×65; checked:
 * shapes only, no scripts or links).
 */

import Image from 'next/image';
import type { ReactElement } from 'react';

const RATIO = 235 / 65;

export function Wordmark({ size = 28 }: { size?: number }): ReactElement {
  // `size` is the logo's height in pixels; the width follows the logo's own shape.
  return (
    <Image
      data-testid="wordmark"
      src="/xspeeria-logo.svg"
      alt="Xspeeria"
      width={Math.round(size * RATIO)}
      height={size}
      unoptimized
      priority
    />
  );
}
