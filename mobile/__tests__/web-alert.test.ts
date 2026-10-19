import { webAlert } from '../src/components/webAlert';

function dialogs(ok = true) {
  return { alert: jest.fn(), confirm: jest.fn(() => ok) };
}

describe('web alert', () => {
  it('shows title and message in a browser alert', () => {
    const d = dialogs();
    webAlert(d)('Couldn’t continue', 'Too many attempts.');
    expect(d.alert).toHaveBeenCalledWith('Couldn’t continue\n\nToo many attempts.');
  });

  it('runs a single button after the alert', () => {
    const d = dialogs();
    const onPress = jest.fn();
    webAlert(d)('Done', undefined, [{ text: 'OK', onPress }]);
    expect(d.alert).toHaveBeenCalledWith('Done');
    expect(onPress).toHaveBeenCalled();
  });

  it('uses confirm for a choice: OK runs the action, Cancel the cancel button', () => {
    const remove = jest.fn();
    const keep = jest.fn();
    const buttons = [
      { text: 'Keep', style: 'cancel' as const, onPress: keep },
      { text: 'Remove', style: 'destructive' as const, onPress: remove },
    ];
    webAlert(dialogs(true))('Remove?', 'Sure?', buttons);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(keep).not.toHaveBeenCalled();
    webAlert(dialogs(false))('Remove?', 'Sure?', buttons);
    expect(keep).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
