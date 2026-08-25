/**
 * Shell for destinations whose content arrives in a later milestone.
 *
 * A destination names a next action whenever one exists. Where the action itself is not
 * built yet, the button is omitted rather than rendered inert: `Marketplace` has no
 * filtering, so it offers no "Clear filters". An action is shown only when a real
 * handler backs it.
 */

import type { ReactElement } from 'react';
import { EmptyState, Screen, Title } from '../../components/primitives';

export function PlaceholderScreen({
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}): ReactElement {
  return (
    <Screen testID={testID}>
      <Title>{title}</Title>
      <EmptyState title={message} actionLabel={actionLabel} onAction={onAction} />
    </Screen>
  );
}
