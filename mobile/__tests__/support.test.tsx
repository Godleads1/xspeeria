import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { SupportChatScreen, clockTime } from '../src/features/support/SupportChatScreen';
import { FALLBACK, bestAnswer, greeting, sensitiveWarning } from '../src/features/support/assistant';
import { FAQ } from '../src/features/faq/data';

const AT = new Date(2026, 9, 17, 8, 20).getTime();

describe('assistant logic', () => {
  it('greets by name (Figma said "Kitsbase")', () => {
    expect(greeting('David')).toMatch(/^Hi David/);
  });

  it('answers only from the FAQ', () => {
    expect(bestAnswer('how do I sell my pounds')?.id).toBe('how-to-sell');
    expect(bestAnswer('what does an exchange cost')?.id).toBe('cost');
    expect(bestAnswer('tell me a joke')).toBeNull();
    expect(bestAnswer('')).toBeNull();
  });

  it('blocks secrets: 2FA codes, recovery codes, full numbers, passwords', () => {
    expect(sensitiveWarning('my code is 123456')).toMatch(/2 FA code/);
    expect(sensitiveWarning('ABCD-EFGH')).toMatch(/recovery code/);
    expect(sensitiveWarning('account 0123456789 please')).toMatch(/account or card/);
    expect(sensitiveWarning('4111 1111 1111 1111')).toMatch(/account or card/);
    expect(sensitiveWarning('my password is hunter2')).toMatch(/password/);
    expect(sensitiveWarning('ending 9309, sent ₦50,000')).toBeNull();
    expect(sensitiveWarning('How do I reset my password?')).toBeNull();
  });

  it('formats Figma-style times', () => {
    expect(clockTime(AT)).toBe('08:20 AM');
    expect(clockTime(new Date(2026, 9, 17, 0, 5).getTime())).toBe('12:05 AM');
    expect(clockTime(new Date(2026, 9, 17, 13, 0).getTime())).toBe('01:00 PM');
  });
});

describe('Support chat screen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the Figma greeting, chip, time and composer', async () => {
    await render(<SupportChatScreen firstName="David" onBack={jest.fn()} now={() => AT} />);
    expect(screen.getByText('Alex Mobile Assistant')).toBeTruthy();
    expect(screen.getByText(greeting('David'))).toBeTruthy();
    expect(screen.getByText('Opening an account')).toBeTruthy();
    expect(screen.getByText('08:20 AM')).toBeTruthy();
    expect(screen.getByPlaceholderText('Write a comment')).toBeTruthy();
    expect(screen.getByText(/Automated assistant/)).toBeTruthy();
  });

  it('a quick reply posts the question and the FAQ answer', async () => {
    await render(<SupportChatScreen firstName="David" onBack={jest.fn()} now={() => AT} />);
    await fireEvent.press(screen.getByTestId('support-chip-create-account'));
    expect(screen.getByText(FAQ[0].answer)).toBeTruthy();
    expect(screen.queryByTestId('support-chip-create-account')).toBeNull();
  });

  it('answers typed questions, with an honest fallback', async () => {
    await render(<SupportChatScreen firstName="David" onBack={jest.fn()} now={() => AT} />);
    await fireEvent.changeText(screen.getByTestId('support-input'), 'tell me a joke');
    await fireEvent.press(screen.getByTestId('support-send'));
    expect(screen.getByText('tell me a joke')).toBeTruthy();
    expect(screen.getByText(FALLBACK)).toBeTruthy();
  });

  it('refuses to send a 2FA code and keeps the draft', async () => {
    await render(<SupportChatScreen firstName="David" onBack={jest.fn()} now={() => AT} />);
    await fireEvent.changeText(screen.getByTestId('support-input'), 'code 654321');
    await fireEvent.press(screen.getByTestId('support-send'));
    expect(screen.getByTestId('support-warning')).toBeTruthy();
    expect(screen.queryByText('code 654321')).toBeNull();
    expect(screen.getByTestId('support-input').props.value).toBe('code 654321');
  });

  it('camera explains that photos and IDs are not accepted in chat', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SupportChatScreen firstName="David" onBack={jest.fn()} now={() => AT} />);
    await fireEvent.press(screen.getByTestId('support-camera'));
    expect(alert.mock.calls[0][1]).toMatch(/never send ID documents/);
  });
});
