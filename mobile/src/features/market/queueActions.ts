/**
 * Join or leave an offer's waiting queue (ADR-059 Decision 4), from the Market tab or search.
 * Uses the app's branded dialog (Alert is routed to it). The server decides everything: who
 * may wait, the limit of 3, one queue per person, and whose turn it is.
 */

import { Alert } from 'react-native';

import { messageFor } from '../../api/client';
import type { QueueEntry } from '../../api/offersApi';
import { tr } from '../../i18n';
import type { Listing } from './data';

export interface QueueSource {
  join(offerId: string): Promise<QueueEntry>;
  leave(offerId: string): Promise<unknown>;
}

function ask(title: string, message: string, confirm: string, destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: tr('Cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: confirm, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Ask, then join (or leave) the queue for a waiting listing. Resolves with a short message to
 * show, or null when the user cancelled. Never throws: a server refusal becomes the message.
 */
export async function queueAction(listing: Listing, source: QueueSource): Promise<string | null> {
  try {
    if (listing.waiting?.inQueue) {
      const leave = await ask(
        tr('You’re in the queue'),
        tr('We’ll tell you when it’s your turn. You then have 5 minutes to take it.'),
        tr('Leave queue'),
        true,
      );
      if (!leave) return null;
      await source.leave(listing.id);
      return tr('You left the queue.');
    }
    const join = await ask(
      tr('Join the queue?'),
      tr('Someone is paying for this offer. If they don’t pay in time, the first person waiting gets 5 minutes to take it. You can wait for one offer at a time.'),
      tr('Join queue'),
    );
    if (!join) return null;
    const entry = await source.join(listing.id);
    return tr('You’re number {{position}} in the queue. We’ll tell you when it’s your turn.', { position: entry.position });
  } catch (e) {
    return messageFor(e);
  }
}
