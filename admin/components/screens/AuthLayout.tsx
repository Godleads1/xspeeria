/**
 * The log-in pages' frame, after the Figma "Xspeeria Login" frames: a frosted card on the
 * left over a deep-blue background. The background is a CSS gradient standing in for the
 * Figma wave image until that image is exported into the project.
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
        background:
          'radial-gradient(ellipse 70% 55% at 75% 30%, #1d4ed8 0%, rgba(29,78,216,0) 70%),' +
          'radial-gradient(ellipse 60% 45% at 60% 85%, #2563eb 0%, rgba(37,99,235,0) 70%),' +
          'linear-gradient(135deg, #0b1d6b 0%, #020617 45%, #0b2fa8 100%)',
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
        <Wordmark size={40} />
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
