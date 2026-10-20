/** Signed-in and trusted devices (server builds). The server is a fake `DevicesSource`. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import type { ServerSession, ServerTrustedDevice } from '../src/api/devicesApi';
import { deviceName, DevicesScreen, type DevicesSource } from '../src/features/profile/DevicesScreen';
import { SecurityScreen } from '../src/features/profile/SecurityScreen';

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

const session = (over: Partial<ServerSession>): ServerSession => ({
  session_id: 's1',
  device_id: null,
  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154.0',
  ip_address: '102.89.22.164',
  created_at: '2026-10-19T10:00:00Z',
  last_active_at: '2026-10-19T12:00:00Z',
  expires_at: '2026-11-19T10:00:00Z',
  current: false,
  ...over,
});

const trusted = (over: Partial<ServerTrustedDevice> = {}): ServerTrustedDevice => ({
  trusted_device_id: 't1',
  device_id: 'd1',
  user_agent: 'okhttp/4.12 Android',
  created_at: '2026-10-19T10:00:00Z',
  expires_at: '2026-11-18T10:00:00Z',
  last_used_at: null,
  ...over,
});

function fake(s: ServerSession[], t: ServerTrustedDevice[]): jest.Mocked<DevicesSource> {
  return {
    sessions: jest.fn(async () => s),
    signOut: jest.fn(async (_id: string) => undefined),
    trusted: jest.fn(async () => t),
    untrust: jest.fn(async (_id: string) => undefined),
  };
}

describe('device names', () => {
  it('turns identity strings into plain names', () => {
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0) Chrome/154.0 Safari/537.36')).toBe('Chrome on Windows computer');
    expect(deviceName('okhttp/4.12 Android 14')).toBe('Xspeeria app on Android phone');
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18) Safari/604.1')).toBe('Safari on iPhone');
    expect(deviceName(null)).toBe('Unknown device');
  });
});

describe('Signed-in devices', () => {
  it('marks this device and signs out another', async () => {
    const src = fake([session({ session_id: 'me', current: true }), session({ session_id: 'other' })], []);
    await render(<DevicesScreen source={src} onBack={jest.fn()} />);
    await flush();
    expect(screen.getByTestId('session-me')).toHaveTextContent(/This device/);
    expect(screen.queryByTestId('session-signout-me')).toBeNull(); // Log out does that
    expect(screen.getByTestId('trusted-empty')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('session-signout-other'));
    await flush();
    expect(src.signOut).toHaveBeenCalledWith('other');
    expect(screen.queryByTestId('session-other')).toBeNull();
  });

  it('stops trusting a device, and shows an error if the server refuses', async () => {
    const src = fake([session({ current: true })], [trusted(), trusted({ trusted_device_id: 't2' })]);
    src.untrust.mockRejectedValueOnce(new ApiError('NETWORK', 0, 'Can’t reach Xspeeria.'));
    await render(<DevicesScreen source={src} onBack={jest.fn()} />);
    await flush();
    await fireEvent.press(screen.getByTestId('trusted-remove-t1'));
    await flush();
    expect(screen.getByTestId('devices-error')).toHaveTextContent(/Can’t reach Xspeeria/);
    expect(screen.getByTestId('trusted-t1')).toBeTruthy(); // still there
    await fireEvent.press(screen.getByTestId('trusted-remove-t2'));
    await flush();
    expect(screen.queryByTestId('trusted-t2')).toBeNull();
  });

  it('never shows the network address', async () => {
    await render(<DevicesScreen source={fake([session({ current: true })], [])} onBack={jest.fn()} />);
    await flush();
    expect(screen.queryByText(/102\.89/)).toBeNull();
  });

  it('is reachable from Security in server builds only', async () => {
    const onOpen = jest.fn();
    const { rerender } = await render(<SecurityScreen onBack={jest.fn()} onOpen={onOpen} />);
    expect(screen.queryByTestId('security-devices')).toBeNull();
    await rerender(<SecurityScreen onBack={jest.fn()} onOpen={onOpen} showDevices />);
    await fireEvent.press(screen.getByTestId('security-devices'));
    expect(onOpen).toHaveBeenCalledWith('devices');
  });
});
