import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactElement, ReactNode } from 'react';

import { LanguageRoot } from '../lib/i18n';
import { THEME_BOOT } from '../lib/theme';
import { admin, color, fontStack, themeCss } from '../theme';

export const metadata: Metadata = {
  title: 'Xspeeria Admin',
  description: 'Xspeeria operator console',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  // ADR-077: this request's script nonce, set by proxy.ts. Reading it renders every page per
  // request (a nonce can't be baked into a static page).
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    // Browser extensions (themes, dark mode, translators) add attributes to <html> before
    // React loads; this ignores attribute differences on this one element only.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved Light / Dark / System choice before the page paints (ADR-064).
            Allowed by the page's script nonce (ADR-077). */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <style>{themeCss()}</style>
        {/* Outlined inputs draw their border on the fieldset; show focus there. */}
        <style>{`fieldset:focus-within{border-color:${color.border.focus}!important;box-shadow:0 0 0 2px color-mix(in srgb, ${color.border.focus} 20%, transparent)}a:focus-visible,button:focus-visible,select:focus-visible,input[type=search]:focus-visible{outline:2px solid ${color.border.focus};outline-offset:2px}`}</style>
      </head>
      {/* Same for <body>: e.g. the ColorZilla extension adds `cz-shortcut-listen`. */}
      <body suppressHydrationWarning style={{ margin: 0, fontFamily: fontStack.brand, color: color.text.primary, backgroundColor: admin.page }}>
        <LanguageRoot>{children}</LanguageRoot>
      </body>
    </html>
  );
}
