import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import * as ScreenCapture from 'expo-screen-capture';

import { SecurityScreen } from '../src/features/profile/SecurityScreen';
import { securitySettings, useApplyScreenCapturePreference } from '../src/features/profile/securitySettings';

jest.mock('expo-screen-capture', () => ({
  allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  securitySettings.reset();
  jest.clearAllMocks();
});

describe('Security screen', () => {
  it('shows the Figma rows and omits Hide Balance', async () => {
    await render(<SecurityScreen onBack={jest.fn()} />);
    for (const t of ['Security', 'Change Password', '2 FA authentication', 'Allow Screenshot']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.queryByText(/balance/i)).toBeNull();
  });

  it('routes the password and 2FA rows', async () => {
    const onOpen = jest.fn();
    await render(<SecurityScreen onBack={jest.fn()} onOpen={onOpen} />);
    await fireEvent.press(screen.getByTestId('security-password'));
    await fireEvent.press(screen.getByTestId('security-2fa'));
    expect(onOpen.mock.calls).toEqual([['password'], ['twoFactor']]);
  });

  it('screenshots are allowed by default and the switch turns them off', async () => {
    await render(<SecurityScreen onBack={jest.fn()} />);
    expect(screen.getByTestId('security-screenshot').props.value).toBe(true);
    await fireEvent(screen.getByTestId('security-screenshot'), 'valueChange', false);
    expect(securitySettings.get().allowScreenshots).toBe(false);
    expect(screen.getByTestId('security-screenshot').props.value).toBe(false);
  });
});

describe('screen-capture preference', () => {
  it('blocks capture when turned off and allows it when turned on', async () => {
    const { rerender } = await renderHook(() => useApplyScreenCapturePreference());
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalled();
    await act(async () => securitySettings.setAllowScreenshots(false));
    await rerender({});
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalled();
  });
});
