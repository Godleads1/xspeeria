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

describe('Change phone (server)', () => {
  it('asks for the authenticator code, then the code sent to the new number', async () => {
    const src = fake();
    const onDone = jest.fn();
    await render(<ServerChangePhoneScreen source={src} onBack={jest.fn()} onDone={onDone} />);
    await fireEvent.changeText(screen.getByTestId('change-phone-input'), '8031111111');
    await fireEvent.press(screen.getByTestId('change-phone-next'));
    await fireEvent.changeText(screen.getByTestId('server-code-input'), '123456');
    await fireEvent.press(screen.getByTestId('server-code-confirm'));
    await flush();
    expect(src.start).toHaveBeenCalledWith('+2348031111111', '123456');
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
    await render(<ServerChangePhoneScreen source={src} onBack={jest.fn()} onDone={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('change-phone-input'), '8031111111');
    await fireEvent.press(screen.getByTestId('change-phone-next'));
    await fireEvent.changeText(screen.getByTestId('server-code-input'), '123456');
    await fireEvent.press(screen.getByTestId('server-code-confirm'));
    await flush();
    await fireEvent.changeText(screen.getByTestId('change-phone-code'), '654321');
    await fireEvent.press(screen.getByTestId('change-phone-confirm'));
    await flush();
    expect(screen.getByTestId('change-phone-error')).toHaveTextContent(/already used/);
  });

  it('refuses a malformed number before asking for any code', async () => {
    const src = fake();
    await render(<ServerChangePhoneScreen source={src} onBack={jest.fn()} onDone={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('change-phone-input'), '12');
    await fireEvent.press(screen.getByTestId('change-phone-next'));
    expect(screen.getByTestId('change-phone-error')).toBeTruthy();
    expect(screen.queryByTestId('server-code-sheet')).toBeNull();
  });
});
