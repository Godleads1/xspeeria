/**
 * The log-in pages' frame, after the Figma "Xspeeria Login" frames: a frosted card on the
 * left over the blue wave background.
 */

import type { ReactElement, ReactNode } from 'react';

import { color, fontStack } from '../../theme';
import { Wordmark } from '../Wordmark';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        padding: 22,
        display: 'flex',
        alignItems: 'stretch',
        fontFamily: fontStack.brand,
        // The owner's Figma background (public/login-background.jpg), with a dark blue
        // behind it while it loads.
        backgroundColor: '#020617',
        backgroundImage: 'url(/login-background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <main
        style={{
          width: '100%',
          maxWidth: 600,
          borderRadius: 24,
          backgroundColor: 'rgba(235, 241, 255, 0.86)',
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
