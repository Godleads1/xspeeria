/**
 * Shell for destinations whose content arrives in a later milestone.
 *
 * Every one still names a next action: no dead ends.
 */

import type { ReactElement } from 'react';
import { EmptyState, Screen, Title } from '../../components/primitives';

export function PlaceholderScreen({
  title,
  message,
  actionLabel,
  testID,
}: {
  title: string;
  message: string;
  actionLabel: string;
  testID?: string;
}): ReactElement {
  return (
    <Screen testID={testID}>
      <Title>{title}</Title>
      <EmptyState title={message} actionLabel={actionLabel} />
    </Screen>
  );
}
