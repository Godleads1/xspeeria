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
    // Browser extensions (themes, dark mode, translators) add attributes to <html> before
    // React loads; this ignores attribute differences on this one element only.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Outlined inputs draw their border on the fieldset; show focus there. */}
        <style>{`fieldset:focus-within{border-color:${color.border.focus}!important;box-shadow:0 0 0 2px ${color.border.focus}33}a:focus-visible,button:focus-visible,select:focus-visible,input[type=search]:focus-visible{outline:2px solid ${color.border.focus};outline-offset:2px}`}</style>
      </head>
      <body style={{ margin: 0, fontFamily: fontStack.brand, color: color.text.primary, backgroundColor: color.bg.canvas }}>
        {children}
      </body>
    </html>
  );
}
