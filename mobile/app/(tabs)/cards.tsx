import type { ReactElement } from 'react';
import { ComingSoonScreen } from '../../src/features/shared/ComingSoonScreen';
import { useThemeMode } from '../../src/theme';

export default function CardsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  return <ComingSoonScreen />;
}
