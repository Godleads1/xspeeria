/**
 * Runs one sensitive action after "Confirm it's you" (ADR-054, server builds). When `visible`
 * turns on it asks `confirmIdentity` (Fingerprint/Face ID, a face check or an email code) and
 * passes the one-use approval to `onSubmit`. Draws nothing itself: the sheet is
 * `ServerConfirmHost`, mounted at the root.
 */

import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { messageFor } from '../../api/client';
import { confirmIdentity, type ConfirmIdentity } from './serverConfirm';
import { tr } from '../../i18n';

export function ServerConfirm({
  visible,
  action,
  reason,
  onSubmit,
  onCancel,
  onError,
  confirm,
}: {
  visible: boolean;
  /** The step-up action the server approves (e.g. `pin.change`). */
  action: string;
  reason: string;
  /** Runs the action with the approval. */
  onSubmit: (approval: string) => Promise<void>;
  /** Cancelled, or finished with an error (after `onError`). */
  onCancel: () => void;
  onError?: (message: string) => void;
  /** Tests inject this. */
  confirm?: ConfirmIdentity;
}): null {
  const running = useRef(false);
  useEffect(() => {
    if (!visible || running.current) return;
    running.current = true;
    void (async () => {
      try {
        const approval = await (confirm ?? confirmIdentity)(action, reason);
        if (!approval) {
          onCancel();
          return;
        }
        await onSubmit(approval);
      } catch (e) {
        const message = messageFor(e);
        if (onError) onError(message);
        else Alert.alert(tr('Couldn’t finish'), message);
        onCancel();
      } finally {
        running.current = false;
      }
    })();
  }, [visible, action, reason, onSubmit, onCancel, onError, confirm]);
  return null;
}
