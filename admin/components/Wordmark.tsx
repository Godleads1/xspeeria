/**
 * The Xspeeria logo (the owner's Figma export, `public/xspeeria-logo.svg`, 235×65; checked:
 * shapes only, no scripts or links). `xspeeria-logo-dark.svg` is the same file with the navy
 * lettering (#001A6E) in white, for dark mode.
 */

import Image from 'next/image';
import type { ReactElement } from 'react';

const RATIO = 235 / 65;

export function Wordmark({ size = 28 }: { size?: number }): ReactElement {
  // `size` is the logo's height in pixels; the width follows the logo's own shape.
  // Dark mode (ADR-064) shows the same logo with the navy lettering in white; the CSS from
  // `themeCss()` hides whichever file does not match the theme.
  const width = Math.round(size * RATIO);
  return (
    <span style={{ display: 'inline-flex' }}>
      <Image className="xs-on-light" data-testid="wordmark" src="/xspeeria-logo.svg" alt="Xspeeria" width={width} height={size} unoptimized priority />
      <Image className="xs-on-dark" src="/xspeeria-logo-dark.svg" alt="Xspeeria" width={width} height={size} unoptimized priority />
    </span>
  );
}
