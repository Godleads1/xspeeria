import { act, render, screen } from '@testing-library/react-native';
import { color } from '@xspeeria/tokens';
import { readFileSync } from 'fs';
import { join } from 'path';

import { LAUNCH_HOLD_MS, LaunchSplash, SPLASH_BACKGROUND } from '../src/features/auth/LaunchSplash';
import { WelcomeScreen } from '../src/features/auth/WelcomeScreen';

describe('launch splash (Figma 33:1355)', () => {
  it('matches the native splash colour', () => {
    const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8'));
    const plugin = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
    expect(SPLASH_BACKGROUND).toBe(plugin[1].backgroundColor);
    expect(SPLASH_BACKGROUND).toBe(color.bg.sunken);
  });

  it('shows the logo, then hands over', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    await render(<LaunchSplash onDone={onDone} />);
    expect(screen.getByTestId('launch-splash')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(LAUNCH_HOLD_MS + 400));
    expect(onDone).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('Welcome (Figma 33:1367)', () => {
  it('shows the Figma hero picture', async () => {
    await render(<WelcomeScreen onSignUp={jest.fn()} onLogIn={jest.fn()} />);
    expect(screen.getByTestId('welcome-hero', { includeHiddenElements: true })).toBeTruthy();
  });
});
