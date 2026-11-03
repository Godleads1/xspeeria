/** ADR-096: release builds run against an https:// server; demo-only screens never show there. */

import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { isServerMode } from '../src/api/config';
import { DemoOnly } from '../src/features/auth/DemoOnly';

jest.mock('expo-router', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { Redirect: ({ href }: { href: string }) => <T testID="redirect">{href}</T> };
});

describe('server mode', () => {
  it('a development build uses any accepted address (also http:// on this computer)', () => {
    expect(isServerMode(true, 'http://192.168.1.20:8000')).toBe(true);
    expect(isServerMode(true, 'https://api.example.ng')).toBe(true);
  });

  it('a release build needs an https:// address; without one it stays "not available"', () => {
    expect(isServerMode(false, 'https://api.example.ng')).toBe(true);
    expect(isServerMode(false, 'http://192.168.1.20:8000')).toBe(false);
    expect(isServerMode(false, null)).toBe(false);
    expect(isServerMode(true, null)).toBe(false);
  });
});

describe('demo-only screens', () => {
  it('show in a development build', async () => {
    await render(<DemoOnly demo><Text testID="demo-screen">demo</Text></DemoOnly>);
    expect(screen.getByTestId('demo-screen')).toBeTruthy();
  });

  it('go to Home in a release build, showing nothing of the demo', async () => {
    await render(<DemoOnly demo={false}><Text testID="demo-screen">demo</Text></DemoOnly>);
    expect(screen.queryByTestId('demo-screen')).toBeNull();
    expect(screen.getByTestId('redirect').props.children).toBe('/');
  });

  it('every route that reads demo stores is wrapped', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs');
    const path = jest.requireActual<typeof import('path')>('path');
    const routes = [
      'app/(app)/history/[id].tsx', 'app/(app)/market/matches.tsx', 'app/(app)/market/payout.tsx',
      'app/(app)/profile/add-beneficiary.tsx', 'app/(app)/profile/beneficiary-details.tsx',
      'app/(app)/profile/authenticator-setup.tsx', 'app/(app)/region/verify.tsx', 'app/(app)/trade/[id].tsx',
      'app/(auth)/signup/biometrics.tsx', 'app/(auth)/signup/email.tsx', 'app/(auth)/signup/verify.tsx',
    ];
    for (const r of routes) {
      const src = fs.readFileSync(path.join(__dirname, '..', r), 'utf8');
      expect(src).toMatch(/export default function \w+Guarded\(\)/);
      expect(src).toContain('<DemoOnly>');
    }
  });
});
