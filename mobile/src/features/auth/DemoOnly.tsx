/**
 * ADR-096: screens that exist only for the demo (they read demo stores or mock data). A
 * release build never shows them: it goes to Home instead, so a deep link or a stale route
 * can't bring demo figures into a store build (ADR-018, ADR-023). Development builds keep them.
 */

import type { ReactElement, ReactNode } from 'react';
import { Redirect } from 'expo-router';

import { DEMO_MODE } from './demo';

export function DemoOnly({ children, demo = DEMO_MODE }: { children: ReactNode; demo?: boolean }): ReactElement {
  if (!demo) return <Redirect href="/" />;
  return <>{children}</>;
}
