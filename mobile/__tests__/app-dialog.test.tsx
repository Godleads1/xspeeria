/** Owner, 2026-10-20: the app's own branded pop-ups, and "Request a card" says it isn't available. */
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AppDialogHost, installAppDialog, showDialog, toneOf } from '../src/components/AppDialog';
import { CardsScreen } from '../src/features/cards/CardsScreen';

const original = Alert.alert;

afterAll(() => {
  Alert.alert = original;
});

describe('app pop-ups', () => {
  it('falls back to the system alert until the host is mounted, then shows its own', async () => {
    const system = jest.fn();
    Alert.alert = system;
    installAppDialog();
    Alert.alert('Before');
    expect(system).toHaveBeenCalledWith('Before', undefined, undefined);
    await render(<AppDialogHost />);
    await act(async () => Alert.alert('Coming soon', 'This is one of the next screens to be built.'));
    expect(screen.getByTestId('app-dialog-title')).toHaveTextContent('Coming soon');
    expect(screen.getByTestId('app-dialog-message')).toHaveTextContent(/next screens/);
    await fireEvent.press(screen.getByTestId('app-dialog-button-0')); // OK
    expect(screen.queryByTestId('app-dialog')).toBeNull();
    expect(system).toHaveBeenCalledTimes(1);
  });

  it('runs the pressed button, queues a second pop-up and styles by kind', async () => {
    await render(<AppDialogHost />);
    const onYes = jest.fn();
    const onNo = jest.fn();
    await act(async () => {
      showDialog({ title: 'Log out?', buttons: [{ text: 'Cancel', style: 'cancel', onPress: onNo }, { text: 'Log out', style: 'destructive', onPress: onYes }] });
      showDialog({ title: 'Second' });
    });
    await fireEvent.press(screen.getByTestId('app-dialog-button-1'));
    expect(onYes).toHaveBeenCalled();
    expect(onNo).not.toHaveBeenCalled();
    expect(screen.getByTestId('app-dialog-title')).toHaveTextContent('Second');
    await fireEvent.press(screen.getByTestId('app-dialog-button-0'));
    expect(screen.queryByTestId('app-dialog')).toBeNull();
    expect(toneOf({ title: 'Log out?', buttons: [{ text: 'x', style: 'destructive' }] })).toBe('warning');
    expect(toneOf({ title: 'Couldn’t sign you in' })).toBe('error');
    expect(toneOf({ title: 'Beneficiary added' })).toBe('success');
    expect(toneOf({ title: 'Coming soon' })).toBe('info');
  });

  it('"Request a card" says the service is not available now', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<CardsScreen />);
    await fireEvent.press(screen.getByTestId('cards-request'));
    expect(spy).toHaveBeenCalledWith('Request a card', expect.stringMatching(/not available now/));
    spy.mockRestore();
  });
});
