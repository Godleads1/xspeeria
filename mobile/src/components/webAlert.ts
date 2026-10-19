/**
 * React Native's `Alert.alert` does nothing in a browser build, so on web every error the app
 * reports that way was silently lost (e.g. sign-up looping back to the PIN screen with no
 * message). On web only, route it to the browser's own dialogs. Native builds are untouched.
 *
 * Buttons: one button → a plain alert, then its handler. Several → a confirm dialog: OK runs the
 * first non-cancel button, Cancel runs the cancel button (if any).
 */
import { Alert, Platform, type AlertButton } from 'react-native';

type Dialogs = {
  alert: (text: string) => void;
  confirm: (text: string) => boolean;
};

export function webAlert(dialogs: Dialogs) {
  return (title: string, message?: string, buttons?: AlertButton[]): void => {
    const text = [title, message].filter((s) => typeof s === 'string' && s.length > 0).join('\n\n');
    const list = buttons ?? [];
    if (list.length <= 1) {
      dialogs.alert(text);
      list[0]?.onPress?.();
      return;
    }
    const cancel = list.find((b) => b.style === 'cancel');
    const action = list.find((b) => b !== cancel);
    if (dialogs.confirm(text)) action?.onPress?.();
    else cancel?.onPress?.();
  };
}

/** Call once at start-up. */
export function installWebAlert(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const w = window;
  Alert.alert = webAlert({ alert: (t) => w.alert(t), confirm: (t) => w.confirm(t) });
}
