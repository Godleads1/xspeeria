/** ADR-047: change phone number against a fake server source. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../src/api/client';
import { ServerChangePhoneScreen, type PhoneChangeSource } from '../src/features/profile/ServerChangePhoneScreen';

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

function fake(): jest.Mocked<PhoneChangeSource> {
  return {
    start: jest.fn(async (_p: string, _c: string) => undefined),
    confirm: jest.fn(async (_p: string, _c: string) => undefined),
  };
}

const confirm = jest.fn(async (_a: string, _r: string): Promise<string | null> => 'approval-1');

beforeEach(() => confirm.mockClear());

describe('Change phone (server)', () => {
  it('asks "Confirm it’s you", then the code sent to the new number', async () => {
    const src = fake();
    const onDone = jest.fn();
    await render(<ServerChangePhoneScreen source={src} onBack={jest.fn()} onDone={onDone} confirmWith={confirm} />);
    await fireEvent.changeText(screen.getByTestId('change-phone-input'), '8031111111');
    await fireEvent.press(screen.getByTestId('change-phone-next'));
    await flush();
    expect(confirm).toHaveBeenCalledWith('contact.change', expect.stringContaining('+2348031111111'));
    expect(src.start).toHaveBeenCalledWith('+2348031111111', 'approval-1');
    expect(screen.getByTestId('change-phone-sent')).toHaveTextContent(/\+2348031111111/);
    await fireEvent.changeText(screen.getByTestId('change-phone-code'), '654321');
    await fireEvent.press(screen.getByTestId('change-phone-confirm'));
    await flush();
    expect(src.confirm).toHaveBeenCalledWith('+2348031111111', '654321');
    expect(onDone).toHaveBeenCalled();
  });

  it('shows the server refusal and keeps the number', async () => {
    const src = fake();
    src.confirm.mockRejectedValueOnce(new ApiError('AUTH_409_PHONE_TAKEN', 409, 'This number is already used by another account.'));
    await render(<ServerChangePhoneScreen source={src} onBack={jest.fn()} onDone={jest.fn()} confirmWith={confirm} />);
    await fireEvent.changeText(screen.getByTestId('change-phone-input'), '8031111111');
    await fireEvent.press(screen.getByTestId('change-phone-next'));
    await flush();
    await fireEvent.changeText(screen.getByTestId('change-phone-code'), '654321');
    await fireEvent.press(screen.getByTestId('change-phone-confirm'));
    await flush();
    expect(screen.getByTestId('change-phone-error')).toHaveTextContent(/already used/);
  });

  it('refuses a malformed number before asking for any code', async () => {
    const src = fake();
    await render(<ServerChangePhoneScreen source={src} onBack={jest.fn()} onDone={jest.fn()} confirmWith={confirm} />);
    await fireEvent.changeText(screen.getByTestId('change-phone-input'), '12');
    await fireEvent.press(screen.getByTestId('change-phone-next'));
    expect(screen.getByTestId('change-phone-error')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('cancelling the check sends nothing; a refused start is shown', async () => {
    const src = fake();
    confirm.mockResolvedValueOnce(null);
    await render(<ServerChangePhoneScreen source={src} onBack={jest.fn()} onDone={jest.fn()} confirmWith={confirm} />);
    await fireEvent.changeText(screen.getByTestId('change-phone-input'), '8031111111');
    await fireEvent.press(screen.getByTestId('change-phone-next'));
    await flush();
    expect(src.start).not.toHaveBeenCalled();
    src.start.mockRejectedValueOnce(new ApiError('AUTH_429_RATE_LIMITED', 429, 'Too many attempts. Please wait and try again.'));
    await fireEvent.press(screen.getByTestId('change-phone-next'));
    await flush();
    expect(screen.getByTestId('change-phone-error')).toHaveTextContent(/Too many attempts/);
    expect(screen.queryByTestId('change-phone-sent')).toBeNull();
  });
});
