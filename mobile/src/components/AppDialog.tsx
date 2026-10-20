/**
 * The app's own pop-up message (owner, 2026-10-20: "redesign the pop-up messages"). Replaces
 * the phone's plain system alert with a branded card: a coloured icon, a bold title, the
 * message and full-width buttons.
 *
 * `installAppDialog()` routes every `Alert.alert(...)` in the app here, on phones and in the
 * browser, so existing calls keep working: one button → OK; a `cancel` button is the outlined
 * one; a `destructive` button is red. `AppDialogHost` is rendered once at the root. If it is
 * not mounted yet, the system alert is used instead, so no message is ever lost.
 */

import { useSyncExternalStore, type ReactElement } from 'react';
import { Alert, Modal, Pressable, Text, View, type AlertButton } from 'react-native';

import { brandWeight, color, space, themed, typography } from '../theme';
import { Icon, type IconName } from './icons';
import { tr } from '../i18n';

export type DialogTone = 'info' | 'warning' | 'error' | 'success';

export interface Dialog {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  tone?: DialogTone;
}

let current: (Dialog & { id: number }) | null = null;
const queue: (Dialog & { id: number })[] = [];
let nextId = 1;
let hosts = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Show a pop-up; queued behind any that is already open. */
export function showDialog(d: Dialog): void {
  const item = { ...d, id: nextId++ };
  if (current) queue.push(item);
  else current = item;
  emit();
}

function close(): void {
  current = queue.shift() ?? null;
  emit();
}

/** Guess the tone from the buttons and words, for plain `Alert.alert` calls. */
export function toneOf(d: Dialog): DialogTone {
  if (d.tone) return d.tone;
  if (d.buttons?.some((b) => b.style === 'destructive')) return 'warning';
  if (/couldn|could not|not right|failed|error|refused/i.test(d.title)) return 'error';
  if (/added|done|saved|changed|sent/i.test(d.title)) return 'success';
  return 'info';
}

/** Call once at start-up. */
export function installAppDialog(): void {
  // Whatever was there before (the phone's alert, or the browser one from webAlert).
  const fallback = Alert.alert;
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]): void => {
    if (hosts === 0) {
      fallback(title, message, buttons);
      return;
    }
    showDialog({ title, message, buttons });
  };
}

const ICON: Record<DialogTone, IconName> = { info: 'info', warning: 'info', error: 'close', success: 'check' };

function fill(t: DialogTone): { surface: string; fill: string } {
  switch (t) {
    case 'success':
      return { surface: color.success.surface, fill: color.success.fill };
    case 'warning':
      return { surface: color.warning.surface, fill: color.warning.fill };
    case 'error':
      return { surface: color.error.surface, fill: color.error.fill };
    default:
      return { surface: color.bg.sunken, fill: color.brand.primary };
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  hosts += 1;
  return () => {
    listeners.delete(l);
    hosts -= 1;
  };
}

export function AppDialogHost(): ReactElement | null {
  const d = useSyncExternalStore(subscribe, () => current, () => current);
  if (!d) return null;
  const tone = toneOf(d);
  const t = fill(tone);
  const buttons = d.buttons && d.buttons.length > 0 ? d.buttons : [{ text: tr('OK') }];
  const press = (b: AlertButton): void => {
    close();
    b.onPress?.();
  };
  const cancel = buttons.find((b) => b.style === 'cancel');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => (cancel ? press(cancel) : close())}>
      <View style={styles.scrim}>
        <View testID="app-dialog" accessibilityViewIsModal accessibilityRole="alert" style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: t.surface }]}>
            <Icon name={ICON[tone]} color={t.fill} size={26} />
          </View>
          <Text testID="app-dialog-title" accessibilityRole="header" style={styles.title}>
            {d.title}
          </Text>
          {d.message ? (
            <Text testID="app-dialog-message" style={styles.message}>
              {d.message}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            {buttons.map((b, i) => {
              const kind = b.style === 'cancel' ? 'cancel' : b.style === 'destructive' ? 'danger' : 'main';
              return (
                <Pressable
                  key={`${b.text ?? ''}-${i}`}
                  testID={`app-dialog-button-${i}`}
                  accessibilityRole="button"
                  onPress={() => press(b)}
                  style={({ pressed }) => [styles.button, styles[kind], pressed ? styles.pressed : null]}
                >
                  <Text style={[styles.buttonText, kind === 'cancel' ? styles.cancelText : null]}>{b.text ?? tr('OK')}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: space.md },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: color.bg.canvas,
    borderRadius: 24,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.md,
    alignItems: 'center',
    gap: space.xs,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 19, color: color.text.primary, textAlign: 'center' },
  message: { ...typography.body, fontSize: 15, lineHeight: 22, color: color.text.secondary, textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: 10, marginTop: space.sm },
  button: { minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  main: { backgroundColor: color.brand.primary },
  danger: { backgroundColor: color.error.fill },
  cancel: { borderWidth: 1, borderColor: color.border.strong },
  pressed: { opacity: 0.8 },
  buttonText: { ...typography.body, ...brandWeight('700'), fontSize: 16, color: color.text.onFill },
  cancelText: { color: color.text.primary },
}));
