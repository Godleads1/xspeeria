import type { Metadata, Viewport } from 'next';
import type { ReactElement, ReactNode } from 'react';

import { color, fontStack } from '../theme';

export const metadata: Metadata = {
  title: 'Xspeeria Admin',
  description: 'Xspeeria operator console',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: fontStack.brand, color: color.text.primary, backgroundColor: color.bg.canvas }}>
        {children}
      </body>
    </html>
  );
}
