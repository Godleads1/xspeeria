/** ADR-052: phone push registration and tapped-push links (untrusted data). */
import { pushLink, registerForPush, type PushDeps } from '../src/features/notifications/push';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const TOKEN = 'ExponentPushToken[abcdefghijklmnop1234]';
const MATCH = '0b6d1f3e-8a2c-4d5e-9f10-112233445566';

function deps(over: Partial<PushDeps> = {}): jest.Mocked<PushDeps> {
  return {
    platform: 'android',
    isDevice: true,
    permission: jest.fn(async () => false),
    ask: jest.fn(async () => true),
    channel: jest.fn(async () => undefined),
    token: jest.fn(async () => TOKEN),
    register: jest.fn(async (_t: string, _p: 'ios' | 'android') => undefined),
    ...over,
  } as jest.Mocked<PushDeps>;
}

describe('registering this phone', () => {
  it('asks once, then gives the token to the server', async () => {
    const d = deps();
    await expect(registerForPush(d)).resolves.toBe('registered');
    expect(d.channel).toHaveBeenCalled();
    expect(d.ask).toHaveBeenCalled();
    expect(d.register).toHaveBeenCalledWith(TOKEN, 'android');
  });

  it('does not ask again when already allowed', async () => {
    const d = deps({ permission: jest.fn(async () => true), platform: 'ios' });
    await expect(registerForPush(d)).resolves.toBe('registered');
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.channel).not.toHaveBeenCalled();
  });

  it('respects a refusal, and skips simulators and the web', async () => {
    const no = deps({ ask: jest.fn(async () => false) });
    await expect(registerForPush(no)).resolves.toBe('denied');
    expect(no.register).not.toHaveBeenCalled();
    await expect(registerForPush(deps({ isDevice: false }))).resolves.toBe('unsupported');
    await expect(registerForPush(deps({ platform: 'web' }))).resolves.toBe('unsupported');
  });

  it('never sends something that is not a push token, and survives failures', async () => {
    const odd = deps({ token: jest.fn(async () => 'not-a-token') });
    await expect(registerForPush(odd)).resolves.toBe('failed');
    expect(odd.register).not.toHaveBeenCalled();
    const down = deps({ register: jest.fn(async () => Promise.reject(new Error('offline'))) });
    await expect(registerForPush(down)).resolves.toBe('failed');
  });
});

describe('tapping a push', () => {
  it('opens the screen for the event, rebuilt from validated ids', () => {
    expect(pushLink({ event: 'kyc.approved', data: { country: 'GB' } })).toBe('/profile/kyc');
    expect(pushLink({ event: 'settlement.completed', data: { match_id: MATCH } })).toBe(`/market/escrow?match=${MATCH}`);
  });

  it('ignores anything odd', () => {
    expect(pushLink(null)).toBeNull();
    expect(pushLink('kyc.approved')).toBeNull();
    expect(pushLink({ event: 'settlement.completed', data: { match_id: '../../admin' } })).toBeNull();
    expect(pushLink({ event: 'unknown.event' })).toBeNull();
    expect(pushLink({ event: 42 })).toBeNull();
    expect(pushLink({ event: 'settlement.completed', data: { match_id: { x: 1 } } })).toBeNull();
  });
});
