/**
 * The log-in pages' frame, after the Figma "Xspeeria Login" frames: a frosted card on the
 * left over the blue wave background.
 */

import type { ReactElement, ReactNode } from 'react';

import { admin, color, fontStack } from '../../theme';
import { LanguagePicker } from '../LanguagePicker';
import { Wordmark } from '../Wordmark';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        // Owner, 2026-10-26: room between the card and the left edge of the screen.
        padding: 'clamp(24px, 4vh, 48px) clamp(24px, 4vw, 48px) clamp(24px, 4vh, 48px) clamp(32px, 6vw, 96px)',
        display: 'flex',
        alignItems: 'stretch',
        fontFamily: fontStack.brand,
        // The owner's Figma background (public/login-background.jpg), with a dark blue
        // behind it while it loads.
        backgroundColor: '#020617',
        backgroundImage: 'url(/login-background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
      }}
    >
      {/* Owner, 2026-10-27: no light/dark buttons on the sign-in pages; they stay in the console header. */}
      <div style={{ position: 'absolute', top: 20, insetInlineEnd: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
        <LanguagePicker />
      </div>
      <main
        style={{
          width: '100%',
          maxWidth: 600,
          borderRadius: 24,
          backgroundColor: admin.glass,
          backdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '88px 24px 48px',
          boxSizing: 'border-box',
        }}
      >
        <Wordmark size={64} />
        <div style={{ width: '100%', maxWidth: 370, marginTop: 64, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.4, color: color.text.primary }}>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

export const linkGreen = {
  color: color.trade.sell,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 0.3,
  textDecoration: 'none',
  alignSelf: 'flex-end',
} as const;
