import type { ReactElement } from 'react';
import { CardsScreen } from '../../src/features/cards/CardsScreen';
import { useThemeMode } from '../../src/theme';

export default function CardsRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  return <CardsScreen />;
}
