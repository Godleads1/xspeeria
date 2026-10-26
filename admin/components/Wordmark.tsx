/**
 * The Xspeeria name as text. Stand-in until the Figma logo file (the multi-colour X) is
 * exported into the project — it is not redrawn here.
 */

import type { ReactElement } from 'react';

import { color } from '../theme';

export function Wordmark({ size = 28 }: { size?: number }): ReactElement {
  return (
    <span
      data-testid="wordmark"
      style={{ fontSize: size, fontWeight: 800, letterSpacing: -0.5, color: color.brand.primary, lineHeight: 1 }}
    >
      Xspeeria
    </span>
  );
}
